"""
Skill Verification Engine — Depth-based, deterministic skill detection.

Detects real skills from ACTUAL CODE, not resume text or AI guesses.
Each skill is evaluated on 4 dimensions:
  1. Presence (is the tech used at all?)
  2. Usage Quality (proper patterns vs anti-patterns)
  3. Complexity (advanced features vs basics)
  4. Optimization (performance patterns, best practices)

Score per skill: 0–10 with sub-indicator breakdown.
Evidence: file paths, repo names, code samples.

NO AI INVOLVEMENT — Pure pattern matching and code analysis.
"""
import re
from collections import defaultdict
from typing import Any, Dict, List, Optional, Tuple, Set

from utils.logging_config import get_logger
from utils.proof import ProofCollector

log = get_logger("skill_verification")


# ═══════════════════════════════════════════════════════
#  SKILL PATTERN LIBRARY — 40+ Technologies
# ═══════════════════════════════════════════════════════

# Each skill has sub-indicators with detection patterns.
# Format: {skill_name: {category, indicators: [{name, patterns, weight, advanced}]}}

SKILL_DEFINITIONS: Dict[str, Dict[str, Any]] = {
    # ─── FRONTEND ───
    "React": {
        "category": "frontend",
        "file_patterns": [r"\.jsx$", r"\.tsx$"],
        "indicators": [
            {"name": "Component usage", "patterns": [r"function\s+[A-Z]\w+", r"const\s+[A-Z]\w+\s*="], "weight": 1, "advanced": False},
            {"name": "useState hook", "patterns": [r"useState\s*\(", r"useState<"], "weight": 1, "advanced": False},
            {"name": "useEffect hook", "patterns": [r"useEffect\s*\("], "weight": 1, "advanced": False},
            {"name": "Context API", "patterns": [r"createContext", r"useContext\s*\(", r"\.Provider"], "weight": 2, "advanced": True},
            {"name": "Custom hooks", "patterns": [r"function\s+use[A-Z]\w+", r"const\s+use[A-Z]\w+\s*="], "weight": 2, "advanced": True},
            {"name": "useMemo/useCallback", "patterns": [r"useMemo\s*\(", r"useCallback\s*\("], "weight": 2, "advanced": True},
            {"name": "useReducer", "patterns": [r"useReducer\s*\("], "weight": 2, "advanced": True},
            {"name": "useRef", "patterns": [r"useRef\s*\("], "weight": 1, "advanced": False},
            {"name": "Suspense/lazy", "patterns": [r"React\.lazy\(", r"<Suspense", r"React\.Suspense"], "weight": 3, "advanced": True},
            {"name": "Error boundaries", "patterns": [r"componentDidCatch", r"getDerivedStateFromError"], "weight": 3, "advanced": True},
            {"name": "Portal usage", "patterns": [r"createPortal"], "weight": 2, "advanced": True},
            {"name": "React.memo", "patterns": [r"React\.memo\(", r"memo\("], "weight": 2, "advanced": True},
        ],
    },
    "Next.js": {
        "category": "frontend",
        "file_patterns": [r"next\.config", r"pages/.*\.(jsx|tsx|js|ts)$", r"app/.*\.(jsx|tsx|js|ts)$"],
        "indicators": [
            {"name": "Page routes", "patterns": [r"export\s+default\s+function\s+\w+Page", r"pages/"], "weight": 1, "advanced": False},
            {"name": "getServerSideProps", "patterns": [r"getServerSideProps", r"getStaticProps", r"getStaticPaths"], "weight": 2, "advanced": True},
            {"name": "API routes", "patterns": [r"pages/api/", r"app/api/", r"NextApiRequest"], "weight": 2, "advanced": False},
            {"name": "Middleware", "patterns": [r"middleware\.(ts|js)", r"NextResponse"], "weight": 2, "advanced": True},
            {"name": "Image optimization", "patterns": [r"next/image", r"<Image"], "weight": 1, "advanced": False},
            {"name": "Server components", "patterns": [r"use\s+server", r"use\s+client"], "weight": 3, "advanced": True},
        ],
    },
    "Vue.js": {
        "category": "frontend",
        "file_patterns": [r"\.vue$"],
        "indicators": [
            {"name": "SFC structure", "patterns": [r"<template>", r"<script>", r"<style"], "weight": 1, "advanced": False},
            {"name": "Composition API", "patterns": [r"setup\(\)", r"ref\(", r"reactive\(", r"computed\("], "weight": 2, "advanced": True},
            {"name": "Vuex/Pinia", "patterns": [r"useStore\(", r"defineStore", r"createStore"], "weight": 2, "advanced": True},
            {"name": "Vue Router", "patterns": [r"vue-router", r"useRouter\(", r"useRoute\("], "weight": 1, "advanced": False},
            {"name": "Custom directives", "patterns": [r"app\.directive\(", r"v-[a-z]+-"], "weight": 3, "advanced": True},
        ],
    },
    "Angular": {
        "category": "frontend",
        "file_patterns": [r"\.component\.ts$", r"angular\.json"],
        "indicators": [
            {"name": "Components", "patterns": [r"@Component\(", r"selector:\s*'"], "weight": 1, "advanced": False},
            {"name": "Services/DI", "patterns": [r"@Injectable\(", r"providedIn"], "weight": 2, "advanced": False},
            {"name": "RxJS usage", "patterns": [r"Observable", r"subscribe\(", r"pipe\(", r"switchMap"], "weight": 2, "advanced": True},
            {"name": "Guards", "patterns": [r"CanActivate", r"canActivate"], "weight": 2, "advanced": True},
            {"name": "Modules", "patterns": [r"@NgModule\(", r"declarations:"], "weight": 1, "advanced": False},
        ],
    },
    "TypeScript": {
        "category": "frontend",
        "file_patterns": [r"\.ts$", r"\.tsx$", r"tsconfig\.json"],
        "indicators": [
            {"name": "Type annotations", "patterns": [r":\s*string\b", r":\s*number\b", r":\s*boolean\b"], "weight": 1, "advanced": False},
            {"name": "Interfaces", "patterns": [r"\binterface\s+\w+", r"\btype\s+\w+\s*="], "weight": 1, "advanced": False},
            {"name": "Generics", "patterns": [r"<T>", r"<T,", r"<T extends"], "weight": 2, "advanced": True},
            {"name": "Enum usage", "patterns": [r"\benum\s+\w+"], "weight": 1, "advanced": False},
            {"name": "Utility types", "patterns": [r"Partial<", r"Required<", r"Pick<", r"Omit<", r"Record<"], "weight": 2, "advanced": True},
            {"name": "Discriminated unions", "patterns": [r"type\s+\w+\s*=.*\|"], "weight": 3, "advanced": True},
            {"name": "Conditional types", "patterns": [r"extends\s+.*\?\s+.*:"], "weight": 3, "advanced": True},
        ],
    },
    # ─── BACKEND ───
    "Node.js": {
        "category": "backend",
        "file_patterns": [r"package\.json", r"server\.(js|ts)$", r"index\.(js|ts)$"],
        "indicators": [
            {"name": "Express/Koa/Fastify", "patterns": [r"require\(['\"]express['\"]", r"from\s+['\"]express['\"]", r"app\.listen\("], "weight": 1, "advanced": False},
            {"name": "Middleware pattern", "patterns": [r"app\.use\(", r"router\.use\(", r"next\(\)"], "weight": 2, "advanced": False},
            {"name": "Async/await", "patterns": [r"async\s+\w+", r"await\s+"], "weight": 1, "advanced": False},
            {"name": "Error middleware", "patterns": [r"err,\s*req,\s*res,\s*next", r"error.*middleware"], "weight": 2, "advanced": True},
            {"name": "Stream usage", "patterns": [r"createReadStream", r"pipe\(", r"\.on\(['\"]data['\"]"], "weight": 3, "advanced": True},
            {"name": "Cluster/Worker", "patterns": [r"cluster\.fork", r"worker_threads"], "weight": 3, "advanced": True},
        ],
    },
    "Python (Backend)": {
        "category": "backend",
        "file_patterns": [r"\.py$"],
        "indicators": [
            {"name": "Flask/FastAPI/Django", "patterns": [r"from flask", r"from fastapi", r"from django", r"Flask\(__name__\)"], "weight": 1, "advanced": False},
            {"name": "Async patterns", "patterns": [r"async\s+def\s+", r"await\s+", r"asyncio\.gather"], "weight": 2, "advanced": True},
            {"name": "ORM usage", "patterns": [r"from sqlalchemy", r"models\.Model", r"Base\.metadata"], "weight": 2, "advanced": False},
            {"name": "Type hints", "patterns": [r"->\s*\w+", r":\s*List\[", r":\s*Dict\[", r":\s*Optional\["], "weight": 2, "advanced": True},
            {"name": "Decorators", "patterns": [r"@app\.\w+\(", r"@router\.\w+\(", r"def\s+\w+_middleware"], "weight": 1, "advanced": False},
            {"name": "Context managers", "patterns": [r"with\s+\w+.*as\s+", r"@contextmanager", r"__enter__"], "weight": 2, "advanced": True},
            {"name": "Celery/Background jobs", "patterns": [r"from celery", r"@celery\.task", r"@shared_task"], "weight": 3, "advanced": True},
            {"name": "Pydantic models", "patterns": [r"from pydantic", r"BaseModel", r"Field\("], "weight": 2, "advanced": True},
        ],
    },
    "Django": {
        "category": "backend",
        "file_patterns": [r"manage\.py", r"settings\.py", r"urls\.py"],
        "indicators": [
            {"name": "Models", "patterns": [r"models\.Model", r"models\.CharField", r"models\.ForeignKey"], "weight": 1, "advanced": False},
            {"name": "Views", "patterns": [r"def\s+\w+\(request", r"class\s+\w+View", r"APIView"], "weight": 1, "advanced": False},
            {"name": "DRF serializers", "patterns": [r"serializers\.Serializer", r"ModelSerializer"], "weight": 2, "advanced": True},
            {"name": "Signals", "patterns": [r"post_save\.connect", r"@receiver\("], "weight": 2, "advanced": True},
            {"name": "Custom managers", "patterns": [r"objects\s*=\s*\w+Manager\(", r"class\s+\w+Manager"], "weight": 3, "advanced": True},
            {"name": "Middleware", "patterns": [r"MIDDLEWARE", r"process_request", r"process_response"], "weight": 2, "advanced": True},
        ],
    },
    "FastAPI": {
        "category": "backend",
        "file_patterns": [r"main\.py"],
        "indicators": [
            {"name": "Route decorators", "patterns": [r"@app\.(get|post|put|delete|patch)\(", r"@router\.(get|post|put|delete)\("], "weight": 1, "advanced": False},
            {"name": "Pydantic models", "patterns": [r"BaseModel", r"Field\(", r"validator"], "weight": 1, "advanced": False},
            {"name": "Dependency injection", "patterns": [r"Depends\(", r"def\s+get_\w+\("], "weight": 2, "advanced": True},
            {"name": "Background tasks", "patterns": [r"BackgroundTasks", r"background_tasks\.add_task"], "weight": 2, "advanced": True},
            {"name": "WebSockets", "patterns": [r"@app\.websocket", r"WebSocket"], "weight": 3, "advanced": True},
            {"name": "Middleware", "patterns": [r"add_middleware", r"@app\.middleware"], "weight": 2, "advanced": True},
        ],
    },
    "Go": {
        "category": "backend",
        "file_patterns": [r"\.go$", r"go\.mod"],
        "indicators": [
            {"name": "HTTP handlers", "patterns": [r"http\.HandleFunc", r"http\.Handler", r"gin\.Context"], "weight": 1, "advanced": False},
            {"name": "Goroutines", "patterns": [r"\bgo\s+\w+\(", r"\bgo\s+func\("], "weight": 2, "advanced": True},
            {"name": "Channels", "patterns": [r"make\(chan\s+", r"<-\s*\w+", r"\w+\s*<-"], "weight": 2, "advanced": True},
            {"name": "Error handling", "patterns": [r"if\s+err\s*!=\s*nil", r"errors\.New\(", r"fmt\.Errorf"], "weight": 1, "advanced": False},
            {"name": "Interfaces", "patterns": [r"type\s+\w+\s+interface\s*\{"], "weight": 2, "advanced": True},
            {"name": "Context usage", "patterns": [r"context\.Context", r"ctx\.Done\(\)", r"context\.WithCancel"], "weight": 2, "advanced": True},
        ],
    },
    "Rust": {
        "category": "backend",
        "file_patterns": [r"\.rs$", r"Cargo\.toml"],
        "indicators": [
            {"name": "Ownership/Borrowing", "patterns": [r"&mut\s+", r"&\w+", r"\.clone\(\)"], "weight": 1, "advanced": False},
            {"name": "Traits", "patterns": [r"impl\s+\w+\s+for", r"trait\s+\w+"], "weight": 2, "advanced": True},
            {"name": "Error handling", "patterns": [r"Result<", r"\.unwrap\(\)", r"\?;", r"\.expect\("], "weight": 1, "advanced": False},
            {"name": "Async/Tokio", "patterns": [r"async\s+fn", r"tokio::", r"\.await"], "weight": 3, "advanced": True},
            {"name": "Macros", "patterns": [r"macro_rules!", r"#\[derive\("], "weight": 2, "advanced": True},
            {"name": "Lifetime annotations", "patterns": [r"<'[a-z]>", r"&'[a-z]\s+"], "weight": 3, "advanced": True},
        ],
    },
    # ─── DATABASES ───
    "SQL/Databases": {
        "category": "database",
        "file_patterns": [r"\.sql$", r"migrations/"],
        "indicators": [
            {"name": "SQL queries", "patterns": [r"SELECT\s+", r"INSERT\s+INTO", r"CREATE\s+TABLE"], "weight": 1, "advanced": False},
            {"name": "ORM models", "patterns": [r"models\.Model", r"Column\(", r"relationship\("], "weight": 1, "advanced": False},
            {"name": "Migrations", "patterns": [r"migration", r"migrate", r"alembic", r"knex\.schema"], "weight": 2, "advanced": True},
            {"name": "Indexes", "patterns": [r"CREATE\s+INDEX", r"index=True", r"db_index"], "weight": 2, "advanced": True},
            {"name": "Transactions", "patterns": [r"BEGIN\s+TRANSACTION", r"session\.commit", r"transaction"], "weight": 3, "advanced": True},
            {"name": "Connection pooling", "patterns": [r"pool_size", r"create_pool", r"connection_pool"], "weight": 3, "advanced": True},
        ],
    },
    "MongoDB": {
        "category": "database",
        "file_patterns": [r"\.js$", r"\.py$"],
        "indicators": [
            {"name": "CRUD operations", "patterns": [r"\.find\(", r"\.insertOne\(", r"\.updateOne\(", r"\.deleteOne\("], "weight": 1, "advanced": False},
            {"name": "Mongoose/ODM", "patterns": [r"mongoose\.Schema", r"new Schema\(", r"MongoClient"], "weight": 1, "advanced": False},
            {"name": "Aggregation", "patterns": [r"\.aggregate\(", r"\$match", r"\$group", r"\$lookup"], "weight": 2, "advanced": True},
            {"name": "Indexing", "patterns": [r"createIndex", r"ensureIndex", r"index:"], "weight": 2, "advanced": True},
        ],
    },
    "Redis": {
        "category": "database",
        "file_patterns": [],
        "indicators": [
            {"name": "Basic operations", "patterns": [r"redis\.", r"\.get\(", r"\.set\(", r"\.hset\("], "weight": 1, "advanced": False},
            {"name": "Pub/Sub", "patterns": [r"\.subscribe\(", r"\.publish\(", r"pubsub"], "weight": 2, "advanced": True},
            {"name": "Caching patterns", "patterns": [r"cache\.", r"\.expire\(", r"\.ttl\(", r"setex"], "weight": 2, "advanced": True},
        ],
    },
    # ─── ML / AI ───
    "Machine Learning": {
        "category": "ml",
        "file_patterns": [r"\.py$", r"\.ipynb$"],
        "indicators": [
            {"name": "Sklearn usage", "patterns": [r"from sklearn", r"fit\(", r"predict\(", r"transform\("], "weight": 1, "advanced": False},
            {"name": "Data preprocessing", "patterns": [r"StandardScaler", r"train_test_split", r"LabelEncoder"], "weight": 1, "advanced": False},
            {"name": "Model evaluation", "patterns": [r"accuracy_score", r"confusion_matrix", r"classification_report", r"cross_val_score"], "weight": 2, "advanced": True},
            {"name": "Hyperparameter tuning", "patterns": [r"GridSearchCV", r"RandomizedSearchCV", r"optuna"], "weight": 3, "advanced": True},
            {"name": "Pipeline usage", "patterns": [r"Pipeline\(", r"make_pipeline"], "weight": 2, "advanced": True},
            {"name": "Feature engineering", "patterns": [r"FeatureUnion", r"ColumnTransformer", r"PolynomialFeatures"], "weight": 3, "advanced": True},
        ],
    },
    "Deep Learning": {
        "category": "ml",
        "file_patterns": [r"\.py$"],
        "indicators": [
            {"name": "PyTorch/TF models", "patterns": [r"import torch", r"import tensorflow", r"nn\.Module", r"tf\.keras"], "weight": 1, "advanced": False},
            {"name": "Neural network layers", "patterns": [r"nn\.Linear", r"nn\.Conv2d", r"Dense\(", r"LSTM\("], "weight": 1, "advanced": False},
            {"name": "Training loop", "patterns": [r"optimizer\.step\(\)", r"loss\.backward\(\)", r"model\.train\(\)"], "weight": 2, "advanced": True},
            {"name": "Custom loss/metrics", "patterns": [r"class\s+\w+Loss", r"def\s+\w+_loss\("], "weight": 3, "advanced": True},
            {"name": "GPU/CUDA", "patterns": [r"\.cuda\(\)", r"\.to\(device\)", r"torch\.device"], "weight": 2, "advanced": True},
            {"name": "Data loaders", "patterns": [r"DataLoader\(", r"Dataset", r"__getitem__"], "weight": 2, "advanced": True},
            {"name": "Transformers/HF", "patterns": [r"from transformers", r"AutoModel", r"AutoTokenizer"], "weight": 3, "advanced": True},
        ],
    },
    "Data Science": {
        "category": "ml",
        "file_patterns": [r"\.py$", r"\.ipynb$"],
        "indicators": [
            {"name": "Pandas", "patterns": [r"import pandas", r"pd\.DataFrame", r"\.groupby\(", r"\.merge\("], "weight": 1, "advanced": False},
            {"name": "Numpy", "patterns": [r"import numpy", r"np\.array", r"np\.zeros"], "weight": 1, "advanced": False},
            {"name": "Visualization", "patterns": [r"matplotlib", r"seaborn", r"plotly", r"\.plot\("], "weight": 1, "advanced": False},
            {"name": "Statistical analysis", "patterns": [r"scipy\.stats", r"statsmodels", r"correlation"], "weight": 2, "advanced": True},
            {"name": "Advanced pandas", "patterns": [r"\.pivot_table\(", r"\.apply\(", r"\.transform\(", r"MultiIndex"], "weight": 2, "advanced": True},
        ],
    },
    # ─── DEVOPS ───
    "Docker": {
        "category": "devops",
        "file_patterns": [r"[Dd]ockerfile", r"docker-compose"],
        "indicators": [
            {"name": "Dockerfile", "patterns": [r"FROM\s+\w+", r"RUN\s+", r"CMD\s+", r"EXPOSE\s+"], "weight": 1, "advanced": False},
            {"name": "Multi-stage builds", "patterns": [r"FROM\s+\w+.*\bas\s+", r"COPY\s+--from="], "weight": 3, "advanced": True},
            {"name": "Docker Compose", "patterns": [r"services:", r"volumes:", r"networks:"], "weight": 1, "advanced": False},
            {"name": "Health checks", "patterns": [r"HEALTHCHECK", r"healthcheck:"], "weight": 2, "advanced": True},
            {"name": "Build optimization", "patterns": [r"\.dockerignore", r"--no-cache", r"layer\s+caching"], "weight": 2, "advanced": True},
        ],
    },
    "Kubernetes": {
        "category": "devops",
        "file_patterns": [r"\.yaml$", r"\.yml$"],
        "indicators": [
            {"name": "Deployments", "patterns": [r"kind:\s*Deployment", r"apiVersion:.*apps/v1"], "weight": 1, "advanced": False},
            {"name": "Services", "patterns": [r"kind:\s*Service", r"ClusterIP", r"NodePort", r"LoadBalancer"], "weight": 1, "advanced": False},
            {"name": "ConfigMaps/Secrets", "patterns": [r"kind:\s*ConfigMap", r"kind:\s*Secret"], "weight": 2, "advanced": True},
            {"name": "Helm charts", "patterns": [r"Chart\.yaml", r"values\.yaml", r"\{\{.*\.Values"], "weight": 3, "advanced": True},
            {"name": "Ingress", "patterns": [r"kind:\s*Ingress", r"ingress\.class"], "weight": 2, "advanced": True},
            {"name": "HPA/Autoscaling", "patterns": [r"HorizontalPodAutoscaler", r"autoscaling"], "weight": 3, "advanced": True},
        ],
    },
    "CI/CD": {
        "category": "devops",
        "file_patterns": [r"\.github/workflows", r"\.gitlab-ci", r"Jenkinsfile", r"\.circleci"],
        "indicators": [
            {"name": "GitHub Actions", "patterns": [r"uses:\s+actions/", r"runs-on:", r"steps:"], "weight": 1, "advanced": False},
            {"name": "Multi-job pipeline", "patterns": [r"needs:", r"jobs:", r"stages:"], "weight": 2, "advanced": True},
            {"name": "Environment secrets", "patterns": [r"secrets\.\w+", r"\$\{\{.*secrets"], "weight": 2, "advanced": True},
            {"name": "Matrix builds", "patterns": [r"matrix:", r"strategy:"], "weight": 2, "advanced": True},
            {"name": "Deploy steps", "patterns": [r"deploy", r"release", r"publish"], "weight": 2, "advanced": True},
        ],
    },
    "AWS": {
        "category": "devops",
        "file_patterns": [r"\.py$", r"\.ts$", r"\.tf$"],
        "indicators": [
            {"name": "SDK usage", "patterns": [r"import boto3", r"aws-sdk", r"@aws-sdk"], "weight": 1, "advanced": False},
            {"name": "S3", "patterns": [r"s3\.upload", r"s3\.getObject", r"s3_client", r"Bucket="], "weight": 1, "advanced": False},
            {"name": "Lambda", "patterns": [r"lambda_handler", r"def handler\(event", r"lambda\.invoke"], "weight": 2, "advanced": True},
            {"name": "DynamoDB", "patterns": [r"dynamodb", r"table\.put_item", r"table\.get_item"], "weight": 2, "advanced": True},
            {"name": "Infrastructure as Code", "patterns": [r"resource\s+\"aws_", r"aws_iam_role", r"CloudFormation"], "weight": 3, "advanced": True},
        ],
    },
    # ─── TESTING ───
    "Testing": {
        "category": "testing",
        "file_patterns": [r"test", r"spec", r"__test__"],
        "indicators": [
            {"name": "Unit tests", "patterns": [r"def\s+test_\w+", r"it\(['\"]", r"describe\(['\"]", r"@Test"], "weight": 1, "advanced": False},
            {"name": "Assertions", "patterns": [r"assert\s+", r"expect\(", r"assertEqual", r"toBe\("], "weight": 1, "advanced": False},
            {"name": "Mocking", "patterns": [r"mock\.", r"@patch\(", r"jest\.mock\(", r"MagicMock"], "weight": 2, "advanced": True},
            {"name": "Fixtures", "patterns": [r"@pytest\.fixture", r"beforeEach\(", r"setUp\("], "weight": 2, "advanced": True},
            {"name": "Integration tests", "patterns": [r"TestClient\(", r"supertest", r"httptest"], "weight": 2, "advanced": True},
            {"name": "Coverage config", "patterns": [r"coverage", r"--cov", r"jest.*coverage"], "weight": 2, "advanced": True},
            {"name": "E2E tests", "patterns": [r"cypress", r"playwright", r"selenium", r"puppeteer"], "weight": 3, "advanced": True},
        ],
    },
    # ─── MOBILE ───
    "React Native": {
        "category": "mobile",
        "file_patterns": [r"\.tsx$", r"\.jsx$", r"app\.json"],
        "indicators": [
            {"name": "RN components", "patterns": [r"react-native", r"<View", r"<Text", r"<ScrollView"], "weight": 1, "advanced": False},
            {"name": "Navigation", "patterns": [r"@react-navigation", r"createStackNavigator", r"NavigationContainer"], "weight": 2, "advanced": False},
            {"name": "Native modules", "patterns": [r"NativeModules", r"requireNativeComponent"], "weight": 3, "advanced": True},
            {"name": "Animations", "patterns": [r"Animated\.", r"useAnimatedStyle", r"react-native-reanimated"], "weight": 2, "advanced": True},
        ],
    },
    "Flutter": {
        "category": "mobile",
        "file_patterns": [r"\.dart$", r"pubspec\.yaml"],
        "indicators": [
            {"name": "Widget usage", "patterns": [r"StatelessWidget", r"StatefulWidget", r"build\(BuildContext"], "weight": 1, "advanced": False},
            {"name": "State management", "patterns": [r"Provider", r"Riverpod", r"BLoC", r"ChangeNotifier"], "weight": 2, "advanced": True},
            {"name": "Navigation", "patterns": [r"Navigator\.", r"GoRouter", r"MaterialPageRoute"], "weight": 1, "advanced": False},
            {"name": "Platform channels", "patterns": [r"MethodChannel", r"EventChannel"], "weight": 3, "advanced": True},
        ],
    },
    # ─── SECURITY ───
    "Security": {
        "category": "security",
        "file_patterns": [],
        "indicators": [
            {"name": "Authentication", "patterns": [r"jwt\.", r"JWT", r"bcrypt", r"passport", r"OAuth"], "weight": 1, "advanced": False},
            {"name": "Input validation", "patterns": [r"sanitize", r"validate\(", r"escape\(", r"Joi\."], "weight": 2, "advanced": True},
            {"name": "CORS config", "patterns": [r"cors\(", r"CORS", r"Access-Control"], "weight": 1, "advanced": False},
            {"name": "Rate limiting", "patterns": [r"rate.?limit", r"throttle", r"express-rate-limit"], "weight": 2, "advanced": True},
            {"name": "Encryption", "patterns": [r"crypto\.", r"hashlib", r"encrypt", r"AES"], "weight": 3, "advanced": True},
            {"name": "HTTPS/TLS", "patterns": [r"https", r"ssl", r"tls", r"certificate"], "weight": 2, "advanced": True},
        ],
    },
    # ─── GRAPHQL ───
    "GraphQL": {
        "category": "backend",
        "file_patterns": [r"\.graphql$", r"schema\.(graphql|gql)"],
        "indicators": [
            {"name": "Schema definition", "patterns": [r"type\s+Query", r"type\s+Mutation", r"schema\s*\{"], "weight": 1, "advanced": False},
            {"name": "Resolvers", "patterns": [r"resolver", r"@Query\(", r"@Mutation\("], "weight": 2, "advanced": False},
            {"name": "Subscriptions", "patterns": [r"type\s+Subscription", r"PubSub", r"pubsub"], "weight": 3, "advanced": True},
            {"name": "DataLoader", "patterns": [r"DataLoader", r"dataloader"], "weight": 3, "advanced": True},
        ],
    },
    # ─── ADDITIONAL SKILLS (v3.0) ───
    "Swift/iOS": {
        "category": "mobile",
        "file_patterns": [r"\.swift$", r"\.xcodeproj", r"Podfile"],
        "indicators": [
            {"name": "UIKit", "patterns": [r"import UIKit", r"UIViewController", r"UITableView"], "weight": 1, "advanced": False},
            {"name": "SwiftUI", "patterns": [r"import SwiftUI", r"@State", r"@Binding", r"VStack", r"HStack"], "weight": 2, "advanced": False},
            {"name": "Core Data", "patterns": [r"NSManagedObject", r"@FetchRequest", r"NSPersistentContainer"], "weight": 2, "advanced": True},
            {"name": "Combine", "patterns": [r"import Combine", r"Publisher", r"AnyPublisher", r"sink\("], "weight": 3, "advanced": True},
            {"name": "Networking", "patterns": [r"URLSession", r"Alamofire", r"Moya"], "weight": 2, "advanced": True},
        ],
    },
    "C/C++": {
        "category": "systems",
        "file_patterns": [r"\.c$", r"\.cpp$", r"\.h$", r"\.hpp$", r"CMakeLists"],
        "indicators": [
            {"name": "Memory management", "patterns": [r"malloc\(", r"free\(", r"new\s+\w+", r"delete\s+"], "weight": 1, "advanced": False},
            {"name": "STL usage", "patterns": [r"std::vector", r"std::map", r"std::string", r"std::unique_ptr"], "weight": 2, "advanced": False},
            {"name": "Templates", "patterns": [r"template\s*<", r"typename\s+\w+"], "weight": 3, "advanced": True},
            {"name": "Multithreading", "patterns": [r"pthread", r"std::thread", r"std::mutex", r"std::async"], "weight": 3, "advanced": True},
            {"name": "CMake", "patterns": [r"cmake_minimum_required", r"add_executable", r"target_link_libraries"], "weight": 2, "advanced": True},
        ],
    },
    "Terraform": {
        "category": "devops",
        "file_patterns": [r"\.tf$", r"\.tfvars$"],
        "indicators": [
            {"name": "Resource blocks", "patterns": [r"resource\s+\"", r"data\s+\""], "weight": 1, "advanced": False},
            {"name": "Modules", "patterns": [r"module\s+\"", r"source\s*="], "weight": 2, "advanced": True},
            {"name": "Variables/Outputs", "patterns": [r"variable\s+\"", r"output\s+\""], "weight": 1, "advanced": False},
            {"name": "State management", "patterns": [r"terraform\s*\{", r"backend\s+\"", r"remote_state"], "weight": 3, "advanced": True},
            {"name": "Provisioners", "patterns": [r"provisioner\s+\"", r"local-exec", r"remote-exec"], "weight": 2, "advanced": True},
        ],
    },
    "gRPC": {
        "category": "backend",
        "file_patterns": [r"\.proto$", r"_pb2\.py$", r"_grpc\.py$"],
        "indicators": [
            {"name": "Proto definitions", "patterns": [r"syntax\s*=\s*\"proto", r"message\s+\w+", r"service\s+\w+"], "weight": 1, "advanced": False},
            {"name": "Streaming", "patterns": [r"stream\s+\w+", r"server_streaming", r"bidi_streaming"], "weight": 3, "advanced": True},
            {"name": "Client usage", "patterns": [r"grpc\.insecure_channel", r"grpc\.secure_channel", r"stub\("], "weight": 2, "advanced": False},
            {"name": "Interceptors", "patterns": [r"interceptor", r"grpc\.UnaryUnaryClientInterceptor"], "weight": 3, "advanced": True},
        ],
    },
    "WebSockets": {
        "category": "backend",
        "file_patterns": [r"\.py$", r"\.js$", r"\.ts$"],
        "indicators": [
            {"name": "WS connection", "patterns": [r"WebSocket\(", r"websocket", r"ws://", r"wss://"], "weight": 1, "advanced": False},
            {"name": "Socket.IO", "patterns": [r"socket\.io", r"socketio", r"io\.connect"], "weight": 2, "advanced": False},
            {"name": "Event handling", "patterns": [r"on\(['\"]message", r"on\(['\"]connect", r"emit\("], "weight": 1, "advanced": False},
            {"name": "Rooms/Namespaces", "patterns": [r"join\(", r"leave\(", r"namespace", r"to\("], "weight": 2, "advanced": True},
        ],
    },
    "Elasticsearch": {
        "category": "data",
        "file_patterns": [r"\.py$", r"\.js$", r"\.ts$", r"\.java$"],
        "indicators": [
            {"name": "Client usage", "patterns": [r"Elasticsearch\(", r"@elastic/elasticsearch", r"elasticsearch-py"], "weight": 1, "advanced": False},
            {"name": "Indexing", "patterns": [r"\.index\(", r"\.bulk\(", r"create_index"], "weight": 2, "advanced": False},
            {"name": "Search queries", "patterns": [r"\.search\(", r"bool.*must", r"aggs", r"aggregations"], "weight": 2, "advanced": True},
            {"name": "Mapping", "patterns": [r"mappings", r"put_mapping", r"analyzer"], "weight": 3, "advanced": True},
        ],
    },
    "Kafka": {
        "category": "data",
        "file_patterns": [r"\.py$", r"\.java$", r"\.ts$"],
        "indicators": [
            {"name": "Producer", "patterns": [r"KafkaProducer", r"producer\.send", r"kafka-node"], "weight": 1, "advanced": False},
            {"name": "Consumer", "patterns": [r"KafkaConsumer", r"consumer\.subscribe", r"consumer_group"], "weight": 1, "advanced": False},
            {"name": "Topics", "patterns": [r"create_topics", r"topic_partitions", r"partition"], "weight": 2, "advanced": True},
            {"name": "Streams", "patterns": [r"KafkaStreams", r"kafka-streams", r"StreamsBuilder"], "weight": 3, "advanced": True},
        ],
    },
    "RabbitMQ": {
        "category": "data",
        "file_patterns": [r"\.py$", r"\.js$", r"\.ts$"],
        "indicators": [
            {"name": "Connection", "patterns": [r"pika\.", r"amqplib", r"amqp://", r"BlockingConnection"], "weight": 1, "advanced": False},
            {"name": "Queue ops", "patterns": [r"queue_declare", r"basic_publish", r"basic_consume"], "weight": 2, "advanced": False},
            {"name": "Exchange patterns", "patterns": [r"exchange_declare", r"fanout", r"topic", r"direct"], "weight": 2, "advanced": True},
            {"name": "Dead letter", "patterns": [r"dead.?letter", r"x-dead-letter", r"DLQ"], "weight": 3, "advanced": True},
        ],
    },
    "Tailwind CSS": {
        "category": "frontend",
        "file_patterns": [r"tailwind\.config", r"\.tsx$", r"\.jsx$", r"\.html$"],
        "indicators": [
            {"name": "Utility classes", "patterns": [r"className=['\"].*(?:flex|grid|p-|m-|text-|bg-)", r"class=['\"].*(?:flex|grid|p-|m-)"], "weight": 1, "advanced": False},
            {"name": "Config", "patterns": [r"tailwind\.config", r"theme:\s*\{", r"extend:\s*\{"], "weight": 2, "advanced": False},
            {"name": "Custom plugins", "patterns": [r"plugin\(", r"addUtilities", r"addComponents"], "weight": 3, "advanced": True},
            {"name": "Responsive design", "patterns": [r"sm:|md:|lg:|xl:|2xl:"], "weight": 1, "advanced": False},
        ],
    },
    "Sass/SCSS": {
        "category": "frontend",
        "file_patterns": [r"\.scss$", r"\.sass$"],
        "indicators": [
            {"name": "Variables", "patterns": [r"\$[\w-]+:", r"@use\s+", r"@forward\s+"], "weight": 1, "advanced": False},
            {"name": "Mixins", "patterns": [r"@mixin\s+", r"@include\s+"], "weight": 2, "advanced": False},
            {"name": "Nesting", "patterns": [r"&\.", r"&:", r"&__", r"&--"], "weight": 1, "advanced": False},
            {"name": "Functions", "patterns": [r"@function\s+", r"@return\s+", r"@each\s+", r"@for\s+"], "weight": 3, "advanced": True},
        ],
    },
}


# ═══════════════════════════════════════════════════════
#  SKILL SCORING ENGINE
# ═══════════════════════════════════════════════════════

def _score_skill(
    skill_name: str,
    skill_def: Dict[str, Any],
    all_sources: List[Dict[str, str]],
    file_paths: List[str],
    proof: ProofCollector,
    deps: Set[str] = None,
    ast_imports: Set[str] = None,
    ast_calls: Set[str] = None,
    ast_jsx: Set[str] = None,
) -> Optional[Dict[str, Any]]:
    """
    Score a single skill based on depth of usage in the codebase.

    Returns None if skill is not detected at all.
    Score is 0-10 based on:
      - Presence of basic indicators (0-3)
      - Advanced indicator usage (0-4)
      - Breadth across files (0-2)
      - Depth within files (0-1)
    """
    indicators = skill_def.get("indicators", [])
    category = skill_def.get("category", "other")

    # Check which indicators are present
    detected_indicators: List[Dict[str, Any]] = []
    evidence_files: Dict[str, List[str]] = defaultdict(list)
    total_matches = 0

    # AST / Dependency Boosting
    skill_lower = skill_name.lower()
    if deps and any(skill_lower in d or d in skill_lower for d in deps if len(d) > 2):
        detected_indicators.append({
            "name": "Dependency Declared",
            "detected": True,
            "advanced": False,
            "weight": 2,
            "match_count": 1,
            "detail": "Verified via package definitions",
        })
        total_matches += 5
        evidence_files["Dependency Declared"].append("package / requirements")

    for indicator in indicators:
        indicator_name = indicator["name"]
        patterns = indicator["patterns"]
        is_advanced = indicator.get("advanced", False)
        weight = indicator.get("weight", 1)
        found = False
        match_count = 0

        for source_info in all_sources:
            source = source_info.get("content", "")
            path = source_info.get("path", "")

            for pattern in patterns:
                # To reduce false positives, check against AST imports if applicable
                matches = re.findall(pattern, source, re.IGNORECASE)
                if matches:
                    # AST validation logic (True if AST validates, or if no AST available for language)
                    if ast_imports or ast_calls or ast_jsx:
                        ast_text = " ".join(ast_imports) + " " + " ".join(ast_calls) + " " + " ".join(ast_jsx)
                        if not re.search(pattern, ast_text, re.IGNORECASE):
                            # Downgrade matches if not found in AST (meaning it was just in comments or strings)
                            match_count += len(matches) * 0.1
                        else:
                            found = True
                            match_count += len(matches)
                            evidence_files[indicator_name].append(path)
                            break
                    else:
                        found = True
                        match_count += len(matches)
                        evidence_files[indicator_name].append(path)
                        break  # One pattern match per file is enough

        if found or match_count >= 1:
            detected_indicators.append({
                "name": indicator_name,
                "detected": True,
                "advanced": is_advanced,
                "weight": weight,
                "match_count": match_count,
                "detail": f"Found in {len(evidence_files[indicator_name])} file(s)",
            })
            total_matches += match_count

    if not detected_indicators:
        return None  # Skill not detected at all

    # ─── Score Calculation ───
    basic_indicators = [i for i in detected_indicators if not i["advanced"]]
    advanced_indicators = [i for i in detected_indicators if i["advanced"]]
    total_possible = len(indicators)

    # 1. Presence score (0-3): based on basic indicator coverage
    basic_ratio = len(basic_indicators) / max(
        sum(1 for i in indicators if not i.get("advanced", False)), 1
    )
    presence_score = min(basic_ratio * 3, 3.0)

    # 2. Advanced usage score (0-4): based on advanced indicator coverage
    if any(i.get("advanced", False) for i in indicators):
        adv_possible = sum(1 for i in indicators if i.get("advanced", False))
        adv_ratio = len(advanced_indicators) / max(adv_possible, 1)
        advanced_score = min(adv_ratio * 4, 4.0)
    else:
        advanced_score = 0.0

    # 3. Breadth score (0-2): how many files demonstrate the skill
    all_evidence_files = set()
    for files in evidence_files.values():
        all_evidence_files.update(files)
    file_count = len(all_evidence_files)
    breadth_score = min(file_count / 3, 2.0)

    # 4. Depth score (0-1): total pattern density
    depth_score = min(total_matches / 20, 1.0)

    final_score = round(presence_score + advanced_score + breadth_score + depth_score, 1)
    final_score = min(final_score, 10.0)

    # Build evidence list
    evidence_list = []
    for indicator_name, files in evidence_files.items():
        for f in files[:2]:  # Max 2 files per indicator
            evidence_list.append({
                "repo": "",  # Filled by caller
                "file": f,
                "sample": indicator_name,
            })
    evidence_list = evidence_list[:5]  # Cap at 5 evidence items

    # Build sub-indicators
    sub_indicators = []
    for indicator in indicators:
        detected = any(d["name"] == indicator["name"] for d in detected_indicators)
        sub_indicators.append({
            "name": indicator["name"],
            "detected": detected,
            "detail": "Advanced" if indicator.get("advanced") else "Basic",
        })

    # Record proof
    for ev in evidence_list[:2]:
        proof.add_skill(
            skill=skill_name,
            repo_name=ev.get("repo", ""),
            file_path=ev["file"],
            detail=f"Score: {final_score}/10, indicators: {len(detected_indicators)}/{total_possible}",
        )

    return {
        "skill_name": skill_name,
        "skill_score": final_score,
        "category": category,
        "evidence": evidence_list,
        "sub_indicators": sub_indicators,
        "indicators_detected": len(detected_indicators),
        "indicators_total": total_possible,
        "basic_detected": len(basic_indicators),
        "advanced_detected": len(advanced_indicators),
    }


# ═══════════════════════════════════════════════════════
#  MASTER ENTRY POINT
# ═══════════════════════════════════════════════════════

def run_skill_verification(
    file_contents: List[Dict[str, str]],
    file_paths: List[str],
    repo_name: str = "",
    proof: Optional[ProofCollector] = None,
) -> Dict[str, Any]:
    """
    Run depth-based skill verification on a repository's source code.

    Args:
        file_contents: List of {"path": ..., "content": ...}
        file_paths: Complete file tree (for file-pattern detection)
        repo_name: Repository name
        proof: ProofCollector

    Returns:
        {"skills": [...], "skill_summary": {...}, "top_skills": [...]}
    """
    if proof is None:
        proof = ProofCollector()

    verified_skills: List[Dict[str, Any]] = []
    
    # ─── Deep Parsing (AST + Deps) ───
    from processing.code_analyzer import extract_ast_signals, extract_dependencies
    try:
        deps = extract_dependencies(file_contents)
        ast_imports, ast_calls, ast_jsx = extract_ast_signals(file_contents)
    except Exception as e:
        log.warning(f"Tree-sitter extraction failed: {e}")
        deps, ast_imports, ast_calls, ast_jsx = set(), set(), set(), set()

    for skill_name, skill_def in SKILL_DEFINITIONS.items():
        result = _score_skill(
            skill_name=skill_name,
            skill_def=skill_def,
            all_sources=file_contents,
            file_paths=file_paths,
            proof=proof,
            deps=deps,
            ast_imports=ast_imports,
            ast_calls=ast_calls,
            ast_jsx=ast_jsx,
        )
        if result:
            # Attach repo name to evidence
            for ev in result.get("evidence", []):
                ev["repo"] = repo_name
            verified_skills.append(result)

    # Sort by score
    verified_skills.sort(key=lambda s: s["skill_score"], reverse=True)

    # Category summary
    category_scores: Dict[str, List[float]] = defaultdict(list)
    for skill in verified_skills:
        category_scores[skill["category"]].append(skill["skill_score"])

    skill_summary = {
        cat: round(sum(scores) / len(scores), 1) if scores else 0.0
        for cat, scores in category_scores.items()
    }

    # Top skills (score >= 3.0)
    top_skills = [s for s in verified_skills if s["skill_score"] >= 3.0]

    return {
        "skills": verified_skills,
        "skill_summary": skill_summary,
        "top_skills": top_skills[:10],
        "total_skills_detected": len(verified_skills),
        "skill_depth_average": round(
            sum(s["skill_score"] for s in verified_skills) / max(len(verified_skills), 1), 1
        ),
    }


def aggregate_skills_across_repos(
    per_repo_results: List[Dict[str, Any]],
    repo_weights: Optional[Dict[str, float]] = None,
) -> Dict[str, Any]:
    """
    Merge skill results from multiple repos into a single profile
    using weighted averaging and confidence scoring.

    For each skill:
      - weighted_score = weighted_avg(repo_scores, repo_weights)
      - confidence = min(1.0, repo_count / 3)
      - Cross-repo bonus: +15% if detected in 3+ repos

    Args:
        per_repo_results: List of per-repo skill verification results.
        repo_weights: Optional {repo_name: weight (0-1)} mapping.
                      If None, all repos weighted equally.

    Output per skill:
      {
        "skill_name": str,
        "skill_score": float (0-10),
        "confidence": float (0-1),
        "repo_count": int,
        ...
      }
    """
    # Collect all scores per skill across repos
    skill_scores: Dict[str, List[Tuple[float, float]]] = defaultdict(list)  # skill -> [(score, weight)]
    skill_evidence: Dict[str, List[Dict]] = defaultdict(list)
    skill_meta: Dict[str, Dict[str, Any]] = {}  # skill -> latest metadata

    for repo_result in per_repo_results:
        repo_name = ""
        for skill in repo_result.get("skills", []):
            name = skill["skill_name"]
            score = skill["skill_score"]

            # Get repo name from evidence
            ev_list = skill.get("evidence", [])
            if ev_list:
                repo_name = ev_list[0].get("repo", "")

            # Look up repo weight
            w = 1.0
            if repo_weights and repo_name:
                w = repo_weights.get(repo_name, 0.5)

            skill_scores[name].append((score, w))
            skill_evidence[name].extend(ev_list)

            # Keep the richest metadata
            if name not in skill_meta or score > skill_meta[name].get("skill_score", 0):
                skill_meta[name] = {
                    "category": skill.get("category", "other"),
                    "sub_indicators": skill.get("sub_indicators", []),
                    "indicators_detected": skill.get("indicators_detected", 0),
                    "indicators_total": skill.get("indicators_total", 0),
                    "basic_detected": skill.get("basic_detected", 0),
                    "advanced_detected": skill.get("advanced_detected", 0),
                }

    # Build merged skills with weighted scores
    merged_skills: List[Dict[str, Any]] = []

    for name, score_weight_pairs in skill_scores.items():
        repo_count = len(score_weight_pairs)

        # Weighted average
        total_weight = sum(w for _, w in score_weight_pairs)
        if total_weight > 0:
            weighted_score = sum(s * w for s, w in score_weight_pairs) / total_weight
        else:
            weighted_score = sum(s for s, _ in score_weight_pairs) / max(repo_count, 1)

        # Cross-repo bonus: if skill found in 3+ repos, boost by 15%
        if repo_count >= 3:
            weighted_score = min(10.0, weighted_score * 1.15)
        elif repo_count >= 2:
            weighted_score = min(10.0, weighted_score * 1.05)

        # Confidence based on repo count
        confidence = min(1.0, repo_count / 3.0)

        meta = skill_meta.get(name, {})
        evidence = skill_evidence.get(name, [])[:8]  # Cap evidence

        merged_skills.append({
            "skill_name": name,
            "skill_score": round(weighted_score, 1),
            "confidence": round(confidence, 2),
            "repo_count": repo_count,
            "category": meta.get("category", "other"),
            "evidence": evidence,
            "sub_indicators": meta.get("sub_indicators", []),
            "indicators_detected": meta.get("indicators_detected", 0),
            "indicators_total": meta.get("indicators_total", 0),
            "basic_detected": meta.get("basic_detected", 0),
            "advanced_detected": meta.get("advanced_detected", 0),
        })

    # Sort by score descending
    merged_skills.sort(key=lambda s: s["skill_score"], reverse=True)

    # Recalculate summary
    category_scores: Dict[str, List[float]] = defaultdict(list)
    for skill in merged_skills:
        category_scores[skill["category"]].append(skill["skill_score"])

    skill_summary = {
        cat: round(sum(scores) / len(scores), 1)
        for cat, scores in category_scores.items()
    }

    return {
        "skills": merged_skills,
        "skill_summary": skill_summary,
        "top_skills": [s for s in merged_skills if s["skill_score"] >= 3.0][:10],
        "total_skills_detected": len(merged_skills),
        "skill_depth_average": round(
            sum(s["skill_score"] for s in merged_skills) / max(len(merged_skills), 1), 1
        ),
    }
