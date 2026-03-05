use native_tls::TlsConnector;
use postgres_native_tls::MakeTlsConnector;
use std::env;
use tokio_postgres::Client;

pub async fn connect() -> Result<Client, lambda_http::Error> {
    let database_url = env::var("DATABASE_URL")
        .map_err(|_| lambda_http::Error::from("DATABASE_URL is required".to_string()))?;

    let tls = TlsConnector::builder().build().map_err(|e| {
        lambda_http::Error::from(format!("Failed to initialize TLS connector: {e}"))
    })?;
    let tls_connector = MakeTlsConnector::new(tls);

    let (client, connection) = tokio_postgres::connect(&database_url, tls_connector)
        .await
        .map_err(|e| lambda_http::Error::from(format!("Database connection error: {e}")))?;

    tokio::spawn(async move {
        if let Err(e) = connection.await {
            tracing::error!(error = %e, "Postgres connection error");
        }
    });

    Ok(client)
}
