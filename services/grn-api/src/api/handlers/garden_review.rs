use crate::ai_model_config;
use crate::auth::extract_auth_context;
use crate::db;
use crate::middleware::{ai_guardrails, entitlements};
use lambda_http::{Body, Request, Response};
use serde::Serialize;
use uuid::Uuid;

const ENTITLEMENT_KEY: &str = "ai.copilot.garden_review";
// Same usable-area margin the designer's capacity meter applies: 10% of a
// bed is paths-of-hand and edge loss, not plantable soil.
const USABLE_AREA_FRACTION: f64 = 0.9;

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum InsightSeverity {
    Warning,
    Tip,
    Info,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GardenReviewInsight {
    pub severity: InsightSeverity,
    pub category: String,
    pub title: String,
    pub detail: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub bed_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub bed_name: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GardenReviewResponse {
    pub model_id: String,
    pub model_version: String,
    pub structured_json: bool,
    pub generated_at: String,
    pub insights: Vec<GardenReviewInsight>,
}

/// Bed fields the review engine reasons about.
#[derive(Debug, Clone)]
pub struct ReviewBed {
    pub id: String,
    pub name: String,
    pub shape: String,
    pub length_inches: Option<i32>,
    pub width_inches: Option<i32>,
    pub points: Option<serde_json::Value>,
    pub sun_exposure: Option<String>,
    pub soil_type: Option<String>,
}

#[derive(Debug, Clone)]
pub struct ReviewCrop {
    pub bed_id: String,
    pub crop_name: String,
    pub plant_count: Option<i32>,
    pub spacing_inches: Option<i32>,
}

pub async fn generate_garden_review(
    request: &Request,
    correlation_id: &str,
) -> Result<Response<Body>, lambda_http::Error> {
    let auth = extract_auth_context(request)?;
    let user_id = Uuid::parse_str(&auth.user_id)
        .map_err(|_| lambda_http::Error::from("Invalid user ID format"))?;

    if !has_garden_review_access(&auth.tier) {
        return json_response(
            403,
            &entitlements::FeatureLockedError {
                entitlement_key: ENTITLEMENT_KEY.to_string(),
            }
            .to_response(),
        );
    }

    let client = db::connect().await?;

    if let Err(feature_locked) =
        entitlements::require_entitlement(&client, user_id, ENTITLEMENT_KEY).await
    {
        return json_response(403, &feature_locked.to_response());
    }

    let model_cfg = ai_model_config::load_model_config();
    let model_id = model_cfg.model_id.clone();
    let model_version = format!("{}-{}", model_cfg.response_mode, model_cfg.schema_version);

    let guardrails =
        ai_guardrails::enforce_and_record(&client, user_id, ENTITLEMENT_KEY, &model_id).await?;
    if !guardrails.allowed {
        return error_response(
            429,
            guardrails
                .reason
                .as_deref()
                .unwrap_or("ai_guardrail_blocked"),
        );
    }

    let bed_rows = client
        .query(
            "
            select id, name, shape, length_inches, width_inches, points,
                   sun_exposure, soil_type
            from garden_beds
            where user_id = $1 and archived_at is null
            order by sort_order asc, created_at asc
            ",
            &[&user_id],
        )
        .await
        .map_err(|e| db_error(&e))?;

    let beds: Vec<ReviewBed> = bed_rows
        .iter()
        .map(|row| ReviewBed {
            id: row.get::<_, Uuid>("id").to_string(),
            name: row.get("name"),
            shape: row.get("shape"),
            length_inches: row.get("length_inches"),
            width_inches: row.get("width_inches"),
            points: row.get("points"),
            sun_exposure: row.get("sun_exposure"),
            soil_type: row.get("soil_type"),
        })
        .collect();

    let crop_rows = client
        .query(
            "
            select bed_id, crop_name, plant_count, spacing_inches
            from grower_crop_library
            where user_id = $1 and bed_id is not null
            ",
            &[&user_id],
        )
        .await
        .map_err(|e| db_error(&e))?;

    let crops: Vec<ReviewCrop> = crop_rows
        .iter()
        .map(|row| ReviewCrop {
            bed_id: row.get::<_, Uuid>("bed_id").to_string(),
            crop_name: row.get("crop_name"),
            plant_count: row.get("plant_count"),
            spacing_inches: row.get("spacing_inches"),
        })
        .collect();

    let insights = build_insights(&beds, &crops);

    tracing::info!(
        correlation_id = correlation_id,
        user_id = %user_id,
        bed_count = beds.len(),
        crop_count = crops.len(),
        insight_count = insights.len(),
        estimated_tokens = guardrails.estimated_tokens,
        "Generated pro garden review"
    );

    json_response(
        200,
        &GardenReviewResponse {
            model_id,
            model_version,
            structured_json: true,
            generated_at: chrono::Utc::now().to_rfc3339(),
            insights,
        },
    )
}

fn has_garden_review_access(tier: &str) -> bool {
    matches!(tier, "pro")
}

// --- Insight engine ---------------------------------------------------------
// Deterministic horticultural rules over the user's transactional garden
// data. Mirrors the ai_copilot pattern: structured advisory output with
// model metadata, guardrail-recorded, nothing written back.

/// Companion-planting families recognized by substring on the crop name.
const FAMILIES: &[(&str, &[&str])] = &[
    (
        "allium",
        &["onion", "garlic", "leek", "shallot", "chive", "scallion"],
    ),
    ("legume", &["bean", "pea ", "peas", "snap pea", "lentil"]),
    (
        "brassica",
        &[
            "cabbage",
            "broccoli",
            "kale",
            "cauliflower",
            "brussels",
            "kohlrabi",
            "collard",
        ],
    ),
    ("tomato", &["tomato"]),
    ("potato", &["potato"]),
    ("fennel", &["fennel"]),
    ("carrot", &["carrot"]),
    ("dill", &["dill"]),
    ("cucumber", &["cucumber"]),
    ("sage", &["sage"]),
];

/// (family a, family b, why they clash). Fennel is handled separately —
/// it suppresses nearly everything.
const CONFLICTS: &[(&str, &str, &str)] = &[
    (
        "allium",
        "legume",
        "Onions, garlic, and their relatives stunt beans and peas",
    ),
    (
        "tomato",
        "brassica",
        "Tomatoes and brassicas compete hard for the same nutrients",
    ),
    (
        "tomato",
        "potato",
        "Tomatoes and potatoes share blight — keeping them together spreads it",
    ),
    (
        "carrot",
        "dill",
        "Dill can stunt carrots and will cross with them when flowering",
    ),
    ("cucumber", "sage", "Sage inhibits cucumber vines"),
];

fn families_for(crop_name: &str) -> Vec<&'static str> {
    let normalized = crop_name.to_lowercase();
    FAMILIES
        .iter()
        .filter(|(_, needles)| {
            needles
                .iter()
                .any(|needle| normalized.contains(needle.trim()))
        })
        .map(|(family, _)| *family)
        .collect()
}

fn bed_area_square_inches(bed: &ReviewBed) -> f64 {
    let length = f64::from(bed.length_inches.unwrap_or(0));
    let width = f64::from(bed.width_inches.unwrap_or(0));
    if bed.shape == "circle" {
        return std::f64::consts::PI * (length / 2.0) * (width / 2.0);
    }
    if bed.shape == "polygon" {
        if let Some(points) = parse_points(bed.points.as_ref()) {
            if points.len() >= 3 {
                let mut sum = 0.0;
                for i in 0..points.len() {
                    let (ax, ay) = points[i];
                    let (bx, by) = points[(i + 1) % points.len()];
                    sum += ax.mul_add(by, -(bx * ay));
                }
                return (sum / 2.0).abs();
            }
        }
    }
    (length * width).max(0.0)
}

fn parse_points(value: Option<&serde_json::Value>) -> Option<Vec<(f64, f64)>> {
    let array = value?.as_array()?;
    let mut points = Vec::with_capacity(array.len());
    for entry in array {
        let x = entry.get("x")?.as_f64()?;
        let y = entry.get("y")?.as_f64()?;
        points.push((x, y));
    }
    Some(points)
}

pub fn build_insights(beds: &[ReviewBed], crops: &[ReviewCrop]) -> Vec<GardenReviewInsight> {
    if beds.is_empty() {
        return vec![GardenReviewInsight {
            severity: InsightSeverity::Info,
            category: "getting_started".to_string(),
            title: "No beds to review yet".to_string(),
            detail: "Add beds in the garden designer and assign crops to them to get a review."
                .to_string(),
            bed_id: None,
            bed_name: None,
        }];
    }

    let mut insights = Vec::new();

    for bed in beds {
        let bed_crops: Vec<&ReviewCrop> = crops.iter().filter(|c| c.bed_id == bed.id).collect();

        insights.extend(companion_conflicts(bed, &bed_crops));

        if let Some(overplanted) = overplanting_insight(bed, &bed_crops) {
            insights.push(overplanted);
        }

        if bed_crops.is_empty() {
            insights.push(GardenReviewInsight {
                severity: InsightSeverity::Tip,
                category: "empty_bed".to_string(),
                title: format!("{} is sitting empty", bed.name),
                detail: "An unplanted bed grows weeds. A quick salad mix or a cover crop keeps the soil working.".to_string(),
                bed_id: Some(bed.id.clone()),
                bed_name: Some(bed.name.clone()),
            });
        }

        if bed.sun_exposure.is_none() || bed.soil_type.is_none() {
            insights.push(GardenReviewInsight {
                severity: InsightSeverity::Info,
                category: "missing_details".to_string(),
                title: format!("{} is missing growing details", bed.name),
                detail: "Record sun exposure and soil type so reviews and recommendations can take them into account.".to_string(),
                bed_id: Some(bed.id.clone()),
                bed_name: Some(bed.name.clone()),
            });
        }
    }

    insights.sort_by_key(|insight| match insight.severity {
        InsightSeverity::Warning => 0,
        InsightSeverity::Tip => 1,
        InsightSeverity::Info => 2,
    });
    insights
}

fn companion_conflicts(bed: &ReviewBed, bed_crops: &[&ReviewCrop]) -> Vec<GardenReviewInsight> {
    let mut present: Vec<(&'static str, String)> = Vec::new();
    for crop in bed_crops {
        for family in families_for(&crop.crop_name) {
            if !present.iter().any(|(f, _)| *f == family) {
                present.push((family, crop.crop_name.clone()));
            }
        }
    }

    let mut conflicts = Vec::new();

    for (family_a, family_b, reason) in CONFLICTS {
        let a = present.iter().find(|(f, _)| f == family_a);
        let b = present.iter().find(|(f, _)| f == family_b);
        if let (Some((_, crop_a)), Some((_, crop_b))) = (a, b) {
            conflicts.push(GardenReviewInsight {
                severity: InsightSeverity::Warning,
                category: "companion_conflict".to_string(),
                title: format!("{crop_a} and {crop_b} clash in {}", bed.name),
                detail: format!("{reason}. Consider moving one of them to another bed."),
                bed_id: Some(bed.id.clone()),
                bed_name: Some(bed.name.clone()),
            });
        }
    }

    // Fennel suppresses nearly every common vegetable, so flag it once if
    // it shares the bed with anything else.
    let has_fennel = present.iter().any(|(f, _)| *f == "fennel");
    if has_fennel && bed_crops.len() > 1 {
        conflicts.push(GardenReviewInsight {
            severity: InsightSeverity::Warning,
            category: "companion_conflict".to_string(),
            title: format!("Fennel wants {} to itself", bed.name),
            detail: "Fennel suppresses the growth of almost every common vegetable. Give it its own corner or container.".to_string(),
            bed_id: Some(bed.id.clone()),
            bed_name: Some(bed.name.clone()),
        });
    }

    conflicts
}

fn overplanting_insight(bed: &ReviewBed, bed_crops: &[&ReviewCrop]) -> Option<GardenReviewInsight> {
    let usable = bed_area_square_inches(bed) * USABLE_AREA_FRACTION;
    if usable <= 0.0 {
        return None;
    }

    let mut used = 0.0;
    let mut counted_any = false;
    for crop in bed_crops {
        let Some(spacing) = crop.spacing_inches else {
            continue;
        };
        if spacing <= 0 {
            continue;
        }
        counted_any = true;
        let plants = f64::from(crop.plant_count.unwrap_or(1).max(1));
        used += plants * f64::from(spacing) * f64::from(spacing);
    }

    if !counted_any || used <= usable {
        return None;
    }

    let percent = (used / usable) * 100.0;
    Some(GardenReviewInsight {
        severity: InsightSeverity::Warning,
        category: "overplanted".to_string(),
        title: format!("{} is overplanted", bed.name),
        detail: format!(
            "Planned crops need roughly {percent:.0}% of the usable space. Crowded plants compete for light and water — thin the plan or add a bed."
        ),
        bed_id: Some(bed.id.clone()),
        bed_name: Some(bed.name.clone()),
    })
}

fn json_response<T: Serialize>(
    status: u16,
    payload: &T,
) -> Result<Response<Body>, lambda_http::Error> {
    let body = serde_json::to_string(payload)
        .map_err(|e| lambda_http::Error::from(format!("Failed to serialize response: {e}")))?;

    Response::builder()
        .status(status)
        .header("content-type", "application/json")
        .body(Body::from(body))
        .map_err(|e| lambda_http::Error::from(e.to_string()))
}

fn error_response(status: u16, message: &str) -> Result<Response<Body>, lambda_http::Error> {
    json_response(status, &serde_json::json!({ "error": message }))
}

fn db_error(error: &tokio_postgres::Error) -> lambda_http::Error {
    lambda_http::Error::from(format!("Database query error: {error}"))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn bed(id: &str, name: &str) -> ReviewBed {
        ReviewBed {
            id: id.to_string(),
            name: name.to_string(),
            shape: "rect".to_string(),
            length_inches: Some(96),
            width_inches: Some(48),
            points: None,
            sun_exposure: Some("full_sun".to_string()),
            soil_type: Some("loam".to_string()),
        }
    }

    fn crop(bed_id: &str, name: &str) -> ReviewCrop {
        ReviewCrop {
            bed_id: bed_id.to_string(),
            crop_name: name.to_string(),
            plant_count: Some(2),
            spacing_inches: Some(12),
        }
    }

    #[test]
    fn garden_review_access_requires_pro_tier() {
        assert!(has_garden_review_access("pro"));
        assert!(!has_garden_review_access("free"));
        assert!(!has_garden_review_access("supporter"));
    }

    #[test]
    fn empty_garden_gets_a_single_getting_started_insight() {
        let insights = build_insights(&[], &[]);
        assert_eq!(insights.len(), 1);
        assert_eq!(insights[0].category, "getting_started");
    }

    #[test]
    fn flags_allium_legume_conflict_in_the_same_bed() {
        let beds = vec![bed("b1", "North bed")];
        let crops = vec![crop("b1", "Garlic"), crop("b1", "Bush beans")];
        let insights = build_insights(&beds, &crops);
        let conflict = insights.iter().find(|i| i.category == "companion_conflict");
        assert!(conflict.is_some_and(
            |i| i.severity == InsightSeverity::Warning && i.title.contains("North bed")
        ));
    }

    #[test]
    fn no_conflict_when_crops_are_in_different_beds() {
        let beds = vec![bed("b1", "A"), bed("b2", "B")];
        let crops = vec![crop("b1", "Garlic"), crop("b2", "Beans")];
        let insights = build_insights(&beds, &crops);
        assert!(!insights.iter().any(|i| i.category == "companion_conflict"));
    }

    #[test]
    fn fennel_sharing_a_bed_is_flagged() {
        let beds = vec![bed("b1", "Herb bed")];
        let crops = vec![crop("b1", "Fennel"), crop("b1", "Tomato")];
        let insights = build_insights(&beds, &crops);
        assert!(insights
            .iter()
            .any(|i| i.category == "companion_conflict" && i.title.contains("Fennel")));
    }

    #[test]
    fn overplanting_uses_spacing_and_plant_count() {
        let beds = vec![bed("b1", "Packed bed")];
        // 96x48 = 4608 sq in, usable 4147. 40 plants * 144 = 5760 > usable.
        let crops = vec![ReviewCrop {
            bed_id: "b1".to_string(),
            crop_name: "Lettuce".to_string(),
            plant_count: Some(40),
            spacing_inches: Some(12),
        }];
        let insights = build_insights(&beds, &crops);
        assert!(insights.iter().any(|i| i.category == "overplanted"));
    }

    #[test]
    fn crops_without_spacing_do_not_trigger_overplanting() {
        let beds = vec![bed("b1", "Bed")];
        let crops = vec![ReviewCrop {
            bed_id: "b1".to_string(),
            crop_name: "Lettuce".to_string(),
            plant_count: Some(400),
            spacing_inches: None,
        }];
        let insights = build_insights(&beds, &crops);
        assert!(!insights.iter().any(|i| i.category == "overplanted"));
    }

    #[test]
    fn empty_bed_and_missing_details_are_reported() {
        let mut empty = bed("b1", "Idle bed");
        empty.sun_exposure = None;
        let insights = build_insights(&[empty], &[]);
        assert!(insights.iter().any(|i| i.category == "empty_bed"));
        assert!(insights.iter().any(|i| i.category == "missing_details"));
    }

    #[test]
    fn polygon_area_uses_shoelace() {
        let mut polygon = bed("b1", "L bed");
        polygon.shape = "polygon".to_string();
        polygon.points = Some(serde_json::json!([
            {"x": 0, "y": 0},
            {"x": 96, "y": 0},
            {"x": 96, "y": 48},
            {"x": 0, "y": 48}
        ]));
        assert!((bed_area_square_inches(&polygon) - 4608.0).abs() < f64::EPSILON);
    }

    #[test]
    fn warnings_sort_before_tips_and_info() {
        let mut no_details = bed("b1", "Bed one");
        no_details.soil_type = None;
        let beds = vec![no_details, bed("b2", "Bed two")];
        let crops = vec![crop("b2", "Garlic"), crop("b2", "Peas")];
        let insights = build_insights(&beds, &crops);
        assert_eq!(insights[0].severity, InsightSeverity::Warning);
    }
}
