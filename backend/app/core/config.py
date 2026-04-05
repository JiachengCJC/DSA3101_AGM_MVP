from pydantic_settings import BaseSettings, SettingsConfigDict

"""
Exact order of reading variable is:
1. OS environment variables (highest priority)
2. .env file values (if .env exists)
3,. Defaults in Settings class (lowest priority)
"""
class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_ignore_empty=True)

    # App
    APP_NAME: str = "AGM Portal MVP"
    ENV: str = "dev"  # dev|prod
    API_V1_PREFIX: str = "/api/v1" # Puts /api/v1 in front of every URL so you can version your API later.

    # Security
    SECRET_KEY: str = "change-me" # used to sign login tokens.
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60*24  # 1 day
    ALGORITHM: str = "HS256"

    # CORS, Guest List of allowed websites in production.
    BACKEND_CORS_ORIGINS: str = "http://localhost:5173,http://localhost:3000"

    # Database, The specific "map" to find your Postgres database container.
    DATABASE_URL: str = "postgresql+psycopg2://postgres:postgres@db:5432/agm"

    # Optional LLM integration
    # 1 = OpenAI API, 2 = Ollama, 3 = local OpenAI-compatible server
    LLM_MODE: int = 3
    LLM_TIMEOUT_SECONDS: float = 30.0

    # Mode 1: OpenAI, insert your own API key here("sk-....")
    OPENAI_API_KEY: str | None = None
    OPENAI_MODEL: str = "gpt-4o-mini"

    # Mode 2: Ollama
    OLLAMA_BASE_URL: str = "http://host.docker.internal:11434"
    OLLAMA_MODEL: str = "phi3:mini"

    # Mode 3: local model server (OpenAI-compatible endpoint)
    # Example servers: llama.cpp server, LM Studio, vLLM.
    LOCAL_LLM_BASE_URL: str = "http://host.docker.internal:1234/v1"
    LOCAL_LLM_MODEL: str = "phi-3-mini-128k-instruct-imatrix-smashed"
    LOCAL_LLM_API_KEY: str | None = None

    # MFA
    RESEND_API_KEY: str | None = None
    RESEND_API_URL: str = "https://api.resend.com/emails"
    RESEND_FROM_EMAIL: str = "onboarding@resend.dev"
    MFA_OTP_EXPIRE_MINUTES: int = 10
    MFA_RESEND_COOLDOWN_SECONDS: int = 60
    MFA_MAX_ATTEMPTS: int = 5
    TRUSTED_DEVICE_EXPIRE_HOURS: int = 1
    TRUSTED_DEVICE_COOKIE_NAME: str = "agm_trusted_device"

settings = Settings()
