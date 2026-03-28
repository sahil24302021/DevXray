"""
System Design Engine — Architecture & Design Quality Analysis.

Analyzes:
  - Architecture type detection (MVC, Clean, Microservices, Modular, Monolith)
  - API design quality (versioning, middleware, auth patterns, validation)
  - Scalability indicators (caching, queues, workers, connection pooling)
  - Folder structure maturity (separation of concerns, config management)
  - Database design quality (migrations, indexing, relationships)

NO AI INVOLVEMENT — Pure deterministic pattern analysis.
"""
import re
from collections import Counter
from typing import Any, Dict, List, Optional, Tuple

from utils.logging_config import get_logger
from utils.proof import ProofCollector

log = get_logger("system_design")

# ═══════════════════════════════════════════════════════
#  ARCHITECTURE TYPE DETECTION
# ═══════════════════════════════════════════════════════

ARCHITECTURE_PATTERNS = {
    "Clean Architecture": {
        "dirs": ["domain", "entities", "use_cases", "usecases", "application", "infrastructure", "adapters", "ports"],
        "min_match": 3,
    },
    "MVC": {
        "dirs": ["models", "views", "controllers", "templates"],
        "min_match": 3,
    },
    "MVVM": {
        "dirs": ["models", "views", "viewmodels", "view_models"],
        "min_match": 3,
    },
    "Microservices": {
        "dirs": ["services", "gateway", "api-gateway", "service-registry", "proto"],
        "files": ["docker-compose.yml", "docker-compose.yaml", "k8s", "kubernetes"],
        "min_match": 2,
    },
    "Hexagonal": {
        "dirs": ["ports", "adapters", "domain", "core"],
        "min_match": 3,
    },
    "Modular": {
        "dirs": ["modules", "packages", "plugins", "extensions"],
        "min_match": 1,
    },
}


def detect_architecture(file_paths: List[str]) -> Dict[str, Any]:
    """Detect architecture type from file tree structure."""
    # Extract all directory names (lowered)
    dir_names = set()
    for p in file_paths:
        parts = p.lower().split("/")
        dir_names.update(parts[:-1])  # Everything except filename

    detected: List[Tuple[str, int]] = []

    for arch_name, patterns in ARCHITECTURE_PATTERNS.items():
        pattern_dirs = patterns.get("dirs", [])
        pattern_files = patterns.get("files", [])
        min_match = patterns.get("min_match", 2)

        matched = sum(1 for d in pattern_dirs if d in dir_names)

        # Check file-level patterns
        for fp in pattern_files:
            if any(fp.lower() in p.lower() for p in file_paths):
                matched += 1

        if matched >= min_match:
            detected.append((arch_name, matched))

    if not detected:
        # Fallback: check if it's at least organized
        common_dirs = {"src", "lib", "app", "api", "core", "config", "utils", "helpers"}
        org_count = sum(1 for d in common_dirs if d in dir_names)
        if org_count >= 3:
            return {"architecture_type": "Organized Monolith", "confidence": 50, "detected_patterns": []}
        return {"architecture_type": "Flat/Monolith", "confidence": 30, "detected_patterns": []}

    # Sort by match count
    detected.sort(key=lambda x: x[1], reverse=True)
    best = detected[0]

    return {
        "architecture_type": best[0],
        "confidence": min(best[1] * 25, 100),
        "detected_patterns": [d[0] for d in detected],
    }


# ═══════════════════════════════════════════════════════
#  API DESIGN QUALITY
# ═══════════════════════════════════════════════════════

def analyze_api_design(
    file_contents: List[Dict[str, str]],
    file_paths: List[str],
) -> Dict[str, Any]:
    """Analyze API design practices from code."""
    score = 0
    signals: List[str] = []
    all_content = "\n".join(fc.get("content", "") for fc in file_contents)

    # API versioning (v1/, v2/, /api/v1)
    if re.search(r'[/"\'](?:api/)?v\d+[/"\']', all_content):
        score += 15
        signals.append("API versioning detected")

    # RESTful route patterns
    rest_patterns = re.findall(
        r'@(?:app|router|api)\.\s*(?:get|post|put|patch|delete)\s*\(\s*["\']',
        all_content, re.IGNORECASE,
    )
    if len(rest_patterns) >= 5:
        score += 15
        signals.append(f"RESTful routing ({len(rest_patterns)} endpoints)")
    elif len(rest_patterns) >= 2:
        score += 8
        signals.append(f"Basic REST routing ({len(rest_patterns)} endpoints)")

    # Request validation (Pydantic, Joi, Zod, class-validator)
    validation_patterns = [
        r'class\s+\w+\(BaseModel\)',     # Pydantic
        r'Joi\.object\(',                 # Joi
        r'z\.object\(',                    # Zod
        r'@IsString\(\)|@IsNumber\(\)',   # class-validator
        r'@Body\(\)|@Query\(\)',          # NestJS decorators
    ]
    for vp in validation_patterns:
        if re.search(vp, all_content):
            score += 10
            signals.append("Request validation framework detected")
            break

    # Authentication patterns
    auth_patterns = [
        r'jwt|JWT|JsonWebToken',
        r'OAuth|oauth',
        r'Bearer\s+',
        r'passport\.',
        r'@login_required|@auth_required|Depends\(.*auth',
    ]
    for ap in auth_patterns:
        if re.search(ap, all_content):
            score += 10
            signals.append("Authentication patterns detected")
            break

    # Middleware usage
    middleware_patterns = [
        r'app\.use\(',
        r'middleware\s*[=:]',
        r'@middleware',
        r'Depends\(',
    ]
    middleware_count = sum(
        1 for mp in middleware_patterns
        if re.search(mp, all_content)
    )
    if middleware_count >= 2:
        score += 10
        signals.append("Middleware architecture detected")
    elif middleware_count >= 1:
        score += 5
        signals.append("Basic middleware usage")

    # Error handling patterns
    error_patterns = [
        r'class\s+\w+Error\(.*Exception\)',   # Custom exceptions
        r'HTTPException|HttpException',         # HTTP errors
        r'@app\.exception_handler',             # Exception handlers
        r'app\.use\(\s*.*error.*\)',            # Express error middleware
    ]
    error_count = sum(1 for ep in error_patterns if re.search(ep, all_content))
    if error_count >= 2:
        score += 10
        signals.append("Structured error handling")
    elif error_count >= 1:
        score += 5
        signals.append("Basic error handling")

    # Rate limiting patterns
    if re.search(r'rate.?limit|throttle|slowdown', all_content, re.IGNORECASE):
        score += 10
        signals.append("Rate limiting detected")

    # CORS configuration
    if re.search(r'CORS|cors|Access-Control-Allow', all_content, re.IGNORECASE):
        score += 5
        signals.append("CORS configuration present")

    # OpenAPI / Swagger docs
    if re.search(r'swagger|openapi|@ApiProperty|@ApiResponse', all_content, re.IGNORECASE):
        score += 5
        signals.append("API documentation (OpenAPI/Swagger)")

    return {
        "api_design_score": min(score, 100),
        "signals": signals[:10],
    }


# ═══════════════════════════════════════════════════════
#  SCALABILITY INDICATORS
# ═══════════════════════════════════════════════════════

def detect_scalability_indicators(
    file_contents: List[Dict[str, str]],
    file_paths: List[str],
) -> Dict[str, Any]:
    """Detect infrastructure and scalability patterns."""
    score = 0
    indicators: List[str] = []
    all_content = "\n".join(fc.get("content", "") for fc in file_contents)
    all_paths = " ".join(file_paths)

    # Caching (Redis, Memcached)
    if re.search(r'redis|Redis|REDIS|memcached|Memcached', all_content):
        score += 15
        indicators.append("Redis/Memcached caching")
    elif re.search(r'@cache|@cached|lru_cache|functools\.cache', all_content):
        score += 8
        indicators.append("In-memory caching")

    # Message queues
    queue_patterns = {
        "Celery": r'celery|Celery|@shared_task|@app\.task',
        "RabbitMQ": r'rabbitmq|pika\.|amqp',
        "Kafka": r'kafka|KafkaProducer|KafkaConsumer',
        "SQS/SNS": r'sqs|sns|boto3.*(?:sqs|sns)',
        "Bull/BullMQ": r'Bull\(|BullMQ',
    }
    for name, pattern in queue_patterns.items():
        if re.search(pattern, all_content, re.IGNORECASE):
            score += 15
            indicators.append(f"Message queue: {name}")
            break

    # Worker/async processing
    if re.search(r'worker|Worker|BackgroundTask|background_tasks', all_content):
        score += 10
        indicators.append("Background worker patterns")

    # Connection pooling
    if re.search(r'pool_size|connection_pool|Pool\(|pooling', all_content, re.IGNORECASE):
        score += 10
        indicators.append("Connection pooling")

    # Load balancing / reverse proxy
    if any(f in all_paths.lower() for f in ["nginx", "haproxy", "traefik"]):
        score += 10
        indicators.append("Load balancer configuration")

    # Container orchestration
    if any(f in all_paths.lower() for f in ["kubernetes", "k8s", "helm", "docker-compose"]):
        score += 15
        indicators.append("Container orchestration")
    elif any(f in all_paths.lower() for f in ["dockerfile", "docker"]):
        score += 8
        indicators.append("Containerization (Docker)")

    # CI/CD pipelines
    ci_patterns = [".github/workflows", ".gitlab-ci", "Jenkinsfile", ".circleci", ".travis.yml"]
    for ci in ci_patterns:
        if any(ci.lower() in p.lower() for p in file_paths):
            score += 10
            indicators.append(f"CI/CD pipeline detected")
            break

    # Logging / monitoring
    if re.search(r'prometheus|grafana|datadog|sentry|newrelic', all_content, re.IGNORECASE):
        score += 10
        indicators.append("Monitoring/observability tools")
    elif re.search(r'logging\.|logger\.|log\.\w+\(', all_content):
        score += 5
        indicators.append("Structured logging")

    # Environment configuration
    if re.search(r'\.env|dotenv|config\.py|settings\.py|environment', all_paths, re.IGNORECASE):
        score += 5
        indicators.append("Environment-based configuration")

    return {
        "scalability_score": min(score, 100),
        "indicators": indicators[:12],
    }


# ═══════════════════════════════════════════════════════
#  DATABASE DESIGN QUALITY
# ═══════════════════════════════════════════════════════

def analyze_database_design(
    file_contents: List[Dict[str, str]],
    file_paths: List[str],
) -> Dict[str, Any]:
    """Analyze database design patterns and quality."""
    score = 0
    signals: List[str] = []
    all_content = "\n".join(fc.get("content", "") for fc in file_contents)

    # ORM usage (SQLAlchemy, Django ORM, Prisma, TypeORM, Sequelize, Mongoose)
    orm_patterns = {
        "SQLAlchemy": r'sqlalchemy|SQLAlchemy|declarative_base|Column\(',
        "Django ORM": r'models\.Model|models\.CharField|models\.ForeignKey',
        "Prisma": r'prisma|PrismaClient|@prisma',
        "TypeORM": r'TypeORM|@Entity|@Column|@ManyToOne',
        "Sequelize": r'sequelize|Sequelize|DataTypes\.',
        "Mongoose": r'mongoose|Schema\(\{|new Schema',
        "Drizzle": r'drizzle|pgTable\(',
    }
    detected_orm = None
    for name, pattern in orm_patterns.items():
        if re.search(pattern, all_content):
            detected_orm = name
            score += 15
            signals.append(f"ORM: {name}")
            break

    # Migrations
    migration_dirs = ["migrations", "alembic", "migrate"]
    if any(d in p.lower() for p in file_paths for d in migration_dirs):
        score += 15
        signals.append("Database migrations present")

    # Indexing
    if re.search(r'index\s*=\s*True|create_index|@Index|\.createIndex|index:\s*true', all_content, re.IGNORECASE):
        score += 10
        signals.append("Database indexing implemented")

    # Relationships / Foreign Keys
    relationship_patterns = [
        r'ForeignKey|foreign_key|@ManyToOne|@OneToMany|@ManyToMany',
        r'relationship\(|references\(|references:\s*',
        r'\.populate\(|\.join\(',
    ]
    for rp in relationship_patterns:
        if re.search(rp, all_content, re.IGNORECASE):
            score += 10
            signals.append("Relationship modeling detected")
            break

    # Connection management / session handling
    if re.search(r'session_factory|Session\(|get_db|get_connection|connection_string', all_content, re.IGNORECASE):
        score += 10
        signals.append("Database connection management")

    # Query optimization patterns
    if re.search(r'select_related|prefetch_related|joinedload|eager_load|\.include\(', all_content, re.IGNORECASE):
        score += 10
        signals.append("Query optimization (eager loading)")

    # Transactions
    if re.search(r'transaction|commit\(\)|rollback\(\)|BEGIN|\.transaction\(', all_content, re.IGNORECASE):
        score += 10
        signals.append("Transaction management")

    # Seeding / fixtures
    if re.search(r'seed|fixture|factory|faker', all_content, re.IGNORECASE):
        score += 5
        signals.append("Database seeding/fixtures")

    # Raw SQL avoidance (lower is better — we reward ORM usage)
    raw_sql_count = len(re.findall(r'execute\(\s*["\'](?:SELECT|INSERT|UPDATE|DELETE)', all_content, re.IGNORECASE))
    if raw_sql_count == 0 and detected_orm:
        score += 5
        signals.append("Pure ORM usage (no raw SQL)")
    elif raw_sql_count > 5:
        signals.append(f"Heavy raw SQL usage ({raw_sql_count} queries) — potential maintainability concern")

    return {
        "database_design_score": min(score, 100),
        "signals": signals[:10],
        "detected_orm": detected_orm or "None",
    }


# ═══════════════════════════════════════════════════════
#  FOLDER MATURITY ASSESSMENT
# ═══════════════════════════════════════════════════════

def assess_folder_maturity(file_paths: List[str]) -> Dict[str, Any]:
    """Assess project folder structure maturity."""
    score = 0
    signals: List[str] = []
    lowered_paths = [p.lower() for p in file_paths]

    # Separation of concerns
    soc_dirs = {
        "models": ["models", "entities", "schemas", "domain"],
        "routes": ["routes", "controllers", "views", "handlers", "endpoints", "api"],
        "services": ["services", "use_cases", "usecases", "interactors"],
        "utilities": ["utils", "helpers", "lib", "common", "shared"],
        "config": ["config", "settings", "configuration"],
        "tests": ["tests", "test", "__tests__", "spec", "specs"],
    }

    found_layers = 0
    for layer_name, dir_names in soc_dirs.items():
        for dn in dir_names:
            if any(f"/{dn}/" in p or p.startswith(f"{dn}/") for p in lowered_paths):
                found_layers += 1
                break

    if found_layers >= 5:
        score += 30
        signals.append(f"Excellent separation of concerns ({found_layers}/6 layers)")
    elif found_layers >= 3:
        score += 20
        signals.append(f"Good separation of concerns ({found_layers}/6 layers)")
    elif found_layers >= 2:
        score += 10
        signals.append(f"Basic separation ({found_layers}/6 layers)")

    # Documentation presence
    doc_files = ["readme.md", "contributing.md", "changelog.md", "docs/", "documentation/"]
    doc_count = sum(1 for df in doc_files if any(df in p for p in lowered_paths))
    if doc_count >= 3:
        score += 15
        signals.append("Comprehensive documentation")
    elif doc_count >= 1:
        score += 8
        signals.append("Basic documentation present")

    # Configuration management
    config_files = [".env", "config.py", "settings.py", "config.json", "config.yaml", ".env.example"]
    config_count = sum(1 for cf in config_files if any(cf in p for p in lowered_paths))
    if config_count >= 2:
        score += 10
        signals.append("Proper configuration management")

    # Build system / package management
    build_files = ["package.json", "requirements.txt", "pyproject.toml", "cargo.toml", "go.mod", "pom.xml", "build.gradle", "makefile"]
    if any(bf in p for p in lowered_paths for bf in build_files):
        score += 10
        signals.append("Package/build management present")

    # Git hygiene
    git_files = [".gitignore", ".gitattributes"]
    if any(gf in p for p in lowered_paths for gf in git_files):
        score += 5
        signals.append("Git hygiene files present")

    # Editor/IDE configuration = less mature (checked by existence of many config files)
    ide_files = [".vscode/", ".idea/"]
    if any(ide in p for p in lowered_paths for ide in ide_files):
        score += 3
        signals.append("IDE configuration shared")

    maturity = "Basic"
    if score >= 60:
        maturity = "Production-Grade"
    elif score >= 40:
        maturity = "Professional"
    elif score >= 20:
        maturity = "Intermediate"

    return {
        "folder_maturity": maturity,
        "folder_maturity_score": min(score, 100),
        "signals": signals[:10],
    }


# ═══════════════════════════════════════════════════════
#  MASTER SYSTEM DESIGN SCORE
# ═══════════════════════════════════════════════════════

def run_system_design_engine(
    file_contents: List[Dict[str, str]],
    file_paths: List[str],
    proof: Optional[ProofCollector] = None,
) -> Dict[str, Any]:
    """
    Master function: compute system design score.

    System Design Score formula:
      25% architecture quality
      25% API design quality
      20% scalability indicators
      15% database design quality
      15% folder structure maturity
    """
    if proof is None:
        proof = ProofCollector()

    arch = detect_architecture(file_paths)
    api = analyze_api_design(file_contents, file_paths)
    scale = detect_scalability_indicators(file_contents, file_paths)
    db = analyze_database_design(file_contents, file_paths)
    folder = assess_folder_maturity(file_paths)

    # Compute weighted score
    arch_score = arch["confidence"]
    api_score = api["api_design_score"]
    scale_score = scale["scalability_score"]
    db_score = db["database_design_score"]
    folder_score = folder["folder_maturity_score"]

    system_design_score = round(
        0.25 * arch_score +
        0.25 * api_score +
        0.20 * scale_score +
        0.15 * db_score +
        0.15 * folder_score,
        1,
    )
    system_design_score = max(0, min(100, system_design_score))

    # Collect proof
    if arch["architecture_type"] not in ("Flat/Monolith",):
        proof.add(
            evidence_type="system_design",
            detail=f"Architecture: {arch['architecture_type']} (confidence: {arch['confidence']}%)",
        )
    if api_score >= 30:
        proof.add(
            evidence_type="system_design",
            detail=f"API design quality: {api_score}/100 — {', '.join(api['signals'][:3])}",
        )
    if scale_score >= 20:
        proof.add(
            evidence_type="system_design",
            detail=f"Scalability indicators: {', '.join(scale['indicators'][:3])}",
        )
    if db_score >= 20:
        proof.add(
            evidence_type="system_design",
            detail=f"Database design: {db_score}/100 — ORM: {db['detected_orm']}",
        )

    proof.add_metric("system_design_score", system_design_score)

    return {
        "system_design_score": system_design_score,
        "architecture": arch,
        "api_design": api,
        "scalability": scale,
        "database_design": db,
        "folder_maturity": folder,
    }
