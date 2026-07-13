#!/usr/bin/env python3
"""
Seed Meridian Commerce demo dataset into DataHub.

Usage:
    export DATAHUB_GMS_URL=http://localhost:8080
    export DATAHUB_GMS_TOKEN=<your-token>  # or leave empty for quickstart
    python scripts/seed_meridian.py

Prerequisites:
    pip install 'acryl-datahub[datahub-rest]'
    datahub docker quickstart
"""

import sys
from datahub.sdk import DataHubClient, Dataset, Tag, Document, DatasetUrn, TagUrn

# ─────────────────────────────────────────────
# Configuration
# ─────────────────────────────────────────────

PLATFORM = "snowflake"
DOMAIN = "meridian"
TEAM = "ml-platform-team"

# ─────────────────────────────────────────────
# Connect to DataHub
# ─────────────────────────────────────────────

try:
    client = DataHubClient.from_env()
    print("✓ Connected to DataHub")
except Exception as e:
    print(f"✗ Failed to connect: {e}")
    print("  Set DATAHUB_GMS_URL and DATAHUB_GMS_TOKEN environment variables")
    sys.exit(1)


# ─────────────────────────────────────────────
# 1. Create Tags
# ─────────────────────────────────────────────

print("\n[1/7] Creating tags...")

TAGS = [
    ("meridian-commerce", "All Meridian Commerce assets"),
    ("pii", "Contains personally identifiable information"),
    ("golden", "Certified/golden dataset"),
    ("quality-failed", "Failed quality checks"),
    ("schema-change", "Affected by schema change"),
    ("at-risk", "At risk of degradation"),
    ("production", "Production-grade asset"),
    ("ml-model", "Machine learning model"),
    ("incident-042", "Linked to Incident #42"),
]

for tag_name, desc in TAGS:
    try:
        client.entities.upsert(Tag(name=tag_name, description=desc))
        print(f"  ✓ Tag: {tag_name}")
    except Exception as e:
        print(f"  ⚠ Tag {tag_name}: {e}")


# ─────────────────────────────────────────────
# 2. Create Datasets
# ─────────────────────────────────────────────

print("\n[2/7] Creating datasets...")

DATASETS = {
    f"{DOMAIN}.raw_events": {
        "description": "Raw clickstream events from the Meridian e-commerce platform. 2M events/day.",
        "fields": [
            ("event_id", "STRING", "Primary key"),
            ("user_id", "STRING", "Foreign key to users"),
            ("user_age", "INT", "User age (PII)"),
            ("event_type", "STRING", "click, view, purchase, add_to_cart"),
            ("product_id", "STRING", "Product identifier"),
            ("timestamp", "TIMESTAMP", "Event timestamp"),
            ("session_id", "STRING", "Session identifier"),
            ("device_type", "STRING", "mobile, desktop, tablet"),
            ("region", "STRING", "Geographic region"),
        ],
        "tags": ["meridian-commerce", "golden", "production"],
    },
    f"{DOMAIN}.feature_pipeline": {
        "description": "dbt transformation pipeline. Runs nightly, computes 50 features.",
        "fields": [
            ("user_id", "STRING", "User identifier"),
            ("age_bucket", "STRING", "Age group: 18-25, 26-35, 36-50, 50+"),
            ("event_frequency", "INT", "Events in last 30 days"),
            ("session_duration", "INT", "Average session duration in seconds"),
            ("purchase_count", "INT", "Total purchases in last 30 days"),
            ("avg_order_value", "DECIMAL(12,2)", "Average order value"),
            ("days_since_last_active", "INT", "Recency score"),
        ],
        "tags": ["meridian-commerce", "production"],
    },
    f"{DOMAIN}.feature_store": {
        "description": "Feature store for ML models. 50 features, 3 models consuming.",
        "fields": [
            ("user_id", "STRING", "User identifier"),
            ("age_bucket", "STRING", "Age group"),
            ("event_frequency", "INT", "Events in last 30 days"),
            ("session_duration", "INT", "Average session duration"),
            ("purchase_count", "INT", "Total purchases"),
            ("avg_order_value", "DECIMAL(12,2)", "Average order value"),
            ("ltv_score", "DECIMAL(12,2)", "Predicted lifetime value"),
            ("churn_probability", "DECIMAL(5,4)", "Churn probability (0-1)"),
        ],
        "tags": ["meridian-commerce", "production"],
    },
    f"{DOMAIN}.daily_revenue": {
        "description": "Aggregated daily revenue by region. Used by CEO Dashboard.",
        "fields": [
            ("report_date", "DATE", "Report date"),
            ("region", "STRING", "Sales region"),
            ("total_orders", "BIGINT", "Order count"),
            ("total_revenue", "DECIMAL(14,2)", "Revenue in USD"),
            ("unique_customers", "BIGINT", "Distinct customers"),
        ],
        "tags": ["meridian-commerce", "production"],
    },
}

for name, config in DATASETS.items():
    try:
        dataset = Dataset(
            platform=PLATFORM,
            name=name,
            schema=[(f[0], f[1]) for f in config["fields"]],
            description=config["description"],
        )
        client.entities.upsert(dataset)
        print(f"  ✓ Dataset: {name}")

        # Add tags
        dataset_urn = DatasetUrn(platform=PLATFORM, name=name)
        entity = client.entities.get(dataset_urn)
        for tag in config.get("tags", []):
            entity.add_tag(TagUrn(tag))
        client.entities.update(entity)

    except Exception as e:
        print(f"  ⚠ Dataset {name}: {e}")


# ─────────────────────────────────────────────
# 3. Create ML Models
# ─────────────────────────────────────────────

print("\n[3/7] Creating ML models...")

try:
    from datahub.sdk.mlmodel import MLModel
    from datahub.sdk.mlmodelgroup import MLModelGroup

    # Model group
    group = MLModelGroup(
        id=f"{DOMAIN}-churn-models",
        name="Meridian Churn Prediction Models",
        platform="mlflow",
        description="Models for predicting customer churn at Meridian Commerce",
    )
    client.entities.upsert(group)
    print("  ✓ Model Group: meridian-churn-models")

    # Models
    MODELS = [
        {
            "id": "churn_model_v3",
            "name": "Churn Prediction Model v3",
            "metrics": {"accuracy": "0.89", "precision": "0.87", "recall": "0.91", "f1": "0.89"},
            "hyperparams": {"algorithm": "XGBoost", "max_depth": "6", "n_estimators": "500", "learning_rate": "0.01"},
            "description": "Predicts 30-day churn probability. 32,000 predictions/day. $2M/quarter retention value.",
        },
        {
            "id": "ltv_model_v2",
            "name": "Lifetime Value Model v2",
            "metrics": {"rmse": "45.2", "mae": "32.1", "r2": "0.84"},
            "hyperparams": {"algorithm": "LightGBM", "num_leaves": "31", "learning_rate": "0.05"},
            "description": "Predicts customer lifetime value. Feeds into pricing engine.",
        },
        {
            "id": "segment_model_v1",
            "name": "Customer Segmentation Model v1",
            "metrics": {"silhouette": "0.72", "calinski_harabasz": "342"},
            "hyperparams": {"algorithm": "KMeans", "n_clusters": "5", "n_init": "10"},
            "description": "Customer segmentation for marketing campaigns. 5 segments.",
        },
    ]

    for model_config in MODELS:
        model = MLModel(
            id=model_config["id"],
            name=model_config["name"],
            platform="mlflow",
            model_group=f"urn:li:mlModelGroup:(urn:li:dataPlatform:mlflow,{DOMAIN}-churn-models,PROD)",
            training_metrics=model_config["metrics"],
            hyper_params=model_config["hyperparams"],
            description=model_config["description"],
        )
        client.entities.upsert(model)
        print(f"  ✓ Model: {model_config['id']}")

except ImportError:
    print("  ⚠ MLModel SDK not available — skipping ML models")
    print("    Install: pip install 'acryl-datahub[datahub-rest]'")


# ─────────────────────────────────────────────
# 4. Create Lineage
# ─────────────────────────────────────────────

print("\n[4/7] Creating lineage...")

LINEAGE = [
    (f"{DOMAIN}.raw_events", f"{DOMAIN}.feature_pipeline"),
    (f"{DOMAIN}.feature_pipeline", f"{DOMAIN}.feature_store"),
    (f"{DOMAIN}.feature_store", "churn_model_v3"),
    (f"{DOMAIN}.feature_store", "ltv_model_v2"),
    (f"{DOMAIN}.feature_store", "segment_model_v1"),
    (f"{DOMAIN}.raw_events", f"{DOMAIN}.daily_revenue"),
]

for upstream_name, downstream_name in LINEAGE:
    try:
        upstream_platform = PLATFORM if "model" not in downstream_name else "mlflow"
        downstream_platform = PLATFORM if "model" not in downstream_name else "mlflow"

        # For model lineage, use mlflow platform
        if "model" in downstream_name:
            downstream_platform = "mlflow"

        client.lineage.add_lineage(
            upstream=DatasetUrn(platform=PLATFORM, name=upstream_name),
            downstream=DatasetUrn(platform=downstream_platform, name=downstream_name),
        )
        print(f"  ✓ Lineage: {upstream_name} → {downstream_name}")
    except Exception as e:
        print(f"  ⚠ Lineage {upstream_name} → {downstream_name}: {e}")


# ─────────────────────────────────────────────
# 5. Create Documents (Knowledge Base)
# ─────────────────────────────────────────────

print("\n[5/7] Creating Knowledge Base documents...")

DOCUMENTS = [
    {
        "id": "incident-042-root-cause",
        "title": "Incident #42 — Root Cause Report",
        "subtype": "Root Cause Report",
        "text": """# Incident #42 — Root Cause Report
Auto-generated: 2026-07-12 14:32 UTC  |  Resolution time: 8 minutes

## Summary
Schema change in meridian.raw_events.age (INT → STRING) caused churn_model_v3
to degrade from 89% to 71% accuracy. 32,000 predictions/day affected.
Estimated revenue at risk: $45,000/day.

## Lineage Path
raw_events → feature_pipeline → feature_store → churn_model_v3
                                              → Customer Churn API
                                              → CEO Dashboard (12 dashboards)

## Root Cause
Column type change broke the age_bucket feature transformation.
The pipeline silently passed STRING values to a model expecting INT,
causing predictions to collapse to a single bucket.

## Resolution Applied
Rollback to churn_model_v3 v2.1. Feature pipeline patched.

## Evidence Chain
- Data Sentinel: confidence 0.94
- Feature Drift: confidence 0.87  (age_bucket distribution collapsed)
- Root Cause: confidence 0.96
- Validation: PASSED""",
        "related_assets": ["urn:li:mlModel:(urn:li:dataPlatform:mlflow,churn_model_v3,PROD)"],
    },
    {
        "id": "incident-028-root-cause",
        "title": "Incident #28 — Root Cause Report",
        "subtype": "Root Cause Report",
        "text": """# Incident #28 — Root Cause Report
Auto-generated: 2026-05-15 10:15 UTC  |  Resolution time: 8 minutes

## Summary
Feature pipeline timeout caused stale features in feature_store.
churn_model_v3 degraded from 88% to 79% accuracy.

## Root Cause
Airflow DAG timeout increased due to upstream data volume spike.
Features were 6 hours stale when model was retrained.

## Resolution
Patched DAG timeout configuration. Retrained model with fresh features.

## Evidence Chain
- Data Sentinel: confidence 0.91
- Feature Drift: confidence 0.85
- Root Cause: confidence 0.93""",
        "related_assets": ["urn:li:mlModel:(urn:li:dataPlatform:mlflow,churn_model_v3,PROD)"],
    },
    {
        "id": "playbook-schema-change",
        "title": "Playbook: Schema Change → Model Degradation",
        "subtype": "Playbook",
        "text": """# Playbook: Schema Change → Model Degradation
Pattern ID: schema-change-type-mismatch
Confidence: 0.96  ·  Based on: incidents #12, #28, #42

## Detection signals
- Column type change in upstream dataset
- Feature pipeline success with silent type coercion
- Model accuracy drop 2–4 hours after pipeline run

## Fastest resolution (learned from 3 incidents)
1. Identify changed column via list_schema_fields diff  (2 min)
2. Trace to affected feature via get_lineage            (3 min)
3. Roll back model to last known-good version           (2 min)
4. Patch feature pipeline type casting                  (5 min)
Total: ~12 min first occurrence. ~3 min with this playbook.

## Incident history
- Incident #12: 18 min resolution (playbook created)
- Incident #28:  8 min (playbook referenced)
- Incident #42:  3 min (pattern matched instantly)""",
        "related_assets": [],
    },
]

for doc_config in DOCUMENTS:
    try:
        doc = Document.create_document(
            id=doc_config["id"],
            title=doc_config["title"],
            text=doc_config["text"],
            subtype=doc_config["subtype"],
            related_assets=doc_config.get("related_assets", []),
        )
        client.entities.upsert(doc)
        print(f"  ✓ Document: {doc_config['title']}")
    except Exception as e:
        print(f"  ⚠ Document {doc_config['title']}: {e}")


# ─────────────────────────────────────────────
# 6. Create Structured Properties
# ─────────────────────────────────────────────

print("\n[6/7] Creating structured properties...")

# Note: Structured properties need to be created via GraphQL first
# This section documents what properties we need
STRUCTURED_PROPERTIES = [
    {"id": "mlSentinels.healthScore", "type": "number", "description": "ML Health Score (0-100)"},
    {"id": "mlSentinels.confidence", "type": "number", "description": "Confidence score (0-1)"},
    {"id": "mlSentinels.resolvedIncidents", "type": "number", "description": "Number of resolved incidents"},
    {"id": "mlSentinels.knownPatterns", "type": "number", "description": "Number of known failure patterns"},
    {"id": "mlSentinels.lastInvestigation", "type": "string", "description": "Timestamp of last investigation"},
    {"id": "mlSentinels.recommendedPlaybook", "type": "string", "description": "Recommended playbook for this model"},
]

print("  ℹ Structured properties need to be created via GraphQL or CLI")
print("    Run: datahub properties upsert -f scripts/structured_properties.yaml")


# ─────────────────────────────────────────────
# 7. Summary
# ─────────────────────────────────────────────

print("\n[7/7] Summary")
print("=" * 50)
print(f"✓ Tags created: {len(TAGS)}")
print(f"✓ Datasets created: {len(DATASETS)}")
print(f"✓ ML Models created: {len(MODELS) if 'MODELS' in dir() else 0}")
print(f"✓ Lineage edges created: {len(LINEAGE)}")
print(f"✓ Documents created: {len(DOCUMENTS)}")
print(f"✓ Structured properties documented: {len(STRUCTURED_PROPERTIES)}")
print("=" * 50)
print("\nMeridian Commerce demo dataset seeded successfully!")
print("\nNext steps:")
print("  1. Open DataHub: http://localhost:9002")
print("  2. Navigate to: churn_model_v3 → look for 'AI Knowledge' section")
print("  3. Run: python scripts/simulate_schema_change.py")
print("  4. Open Mission Control: http://localhost:3000")
