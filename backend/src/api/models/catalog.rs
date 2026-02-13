use serde::Serialize;

#[derive(Debug, Serialize)]
pub struct CatalogCrop {
    pub id: String,
    pub slug: String,
    pub common_name: String,
    pub scientific_name: Option<String>,
    pub category: Option<String>,
    pub description: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct CatalogVariety {
    pub id: String,
    pub crop_id: String,
    pub slug: String,
    pub name: String,
    pub description: Option<String>,
}
