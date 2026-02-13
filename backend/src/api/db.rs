use std::env;
use tokio_postgres::{Client, NoTls};

pub async fn connect() -> Result<Client, lambda_http::Error> {
    let database_url = env::var("DATABASE_URL")
        .map_err(|_| lambda_http::Error::from("DATABASE_URL is required".to_string()))?;

    let (client, connection) = tokio_postgres::connect(&database_url, NoTls)
        .await
        .map_err(|e| lambda_http::Error::from(format!("Database connection error: {e}")))?;

    tokio::spawn(async move {
        if let Err(e) = connection.await {
            tracing::error!(error = %e, "Postgres connection error");
        }
    });

    Ok(client)
}
