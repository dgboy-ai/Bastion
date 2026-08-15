# Technical Plan: FairShield — AI Tenant Screening Discrimination Audit Agent

**Hackathon:** Agents for Humans (Good Neighbor Track)
**Deadline:** September 15, 2026
**Tech Stack:** Strands Agents SDK + AWS Bedrock + AgentCore

---

## 1. ONE-SENTENCE IDENTITY

> "FairShield gives fair housing nonprofits the investigative power of 50 full-time testers — so 5 staff members can protect an entire city's renters from algorithmic discrimination."

## 2. THE PROBLEM (30 seconds)

Fair housing nonprofits are the last line of defense against algorithmic discrimination in tenant screening. But they can only test a few properties a week manually. Meanwhile, 80% of multifamily operators use AI screening tools, 33% have zero governance policies, and the SafeRent settlement ($2.275M) proved these tools violate the Fair Housing Act. The enforcement wave is building — private fair housing orgs processed 74% of all discrimination complaints in 2024 — but they're outgunned.

## 3. THE SOLUTION (60 seconds)

FairShield is an autonomous agent that runs the same tests a fair housing org would run — but at 10,000x the scale. It generates synthetic applicant profiles across all 7 Fair Housing Act protected classes, submits them to a screening tool, detects statistical patterns of disparate impact, and produces FHA-compliant violation reports with legal citations. It runs continuously in the background, only surfacing when discrimination is detected.

## 4. ARCHITECTURE

### Multi-Agent Design (Strands Agents-as-Tools Pattern)

```
┌─────────────────────────────────────────────────────┐
│                 ORCHESTRATOR AGENT                    │
│         (Strands Agent, Bedrock Claude)              │
│  - Coordinates all sub-agents                        │
│  - Manages audit lifecycle                           │
│  - Surfaces results to dashboard                     │
└─────────┬───────────────────────────────────────────┘
          │
    ┌─────┴─────┬──────────────┬──────────────┬──────────────┐
    ▼           ▼              ▼              ▼              ▼
┌────────┐ ┌────────┐   ┌──────────┐   ┌──────────┐   ┌──────────┐
│PROFILE │ │SUBMIT  │   │STATISTICS│   │LEGAL RAG │   │REPORT    │
│GEN     │ │AGENT   │   │AGENT     │   │AGENT     │   │GENERATOR │
│AGENT   │ │        │   │          │   │          │   │          │
└────────┘ └────────┘   └──────────┘   └──────────┘   └──────────┘
```

### Agent Responsibilities

#### Agent 1: Profile Generator
- **Input:** Audit configuration (city, screening tool, protected classes to test)
- **Output:** 200+ synthetic applicant profiles
- **Method:** Generates matched-pair profiles using Bertrand & Mullainathan name-race methodology
- **Tools:** `generate_profiles`, `validate_profile_distribution`
- **Protected dimensions:**
  - Race (via validated race-signaling names)
  - Source of income (employment vs. housing voucher)
  - Disability status (none vs. accommodation request)
  - Familial status (single vs. family with children)
  - National origin (via name/signaling)
  - Religion (via name/signaling)
  - Age (via graduation year proxy)

#### Agent 2: Submission Agent
- **Input:** Synthetic profiles + screening tool endpoint
- **Output:** Raw responses (scores, decisions, denial reasons)
- **Method:** Submits profiles via API or browser automation (AgentCore Browser)
- **Tools:** `submit_application`, `record_response`, `manage_submission_batch`
- **Key:** Records every field of the response for later analysis

#### Agent 3: Statistics Agent
- **Input:** Raw responses from Submission Agent
- **Output:** Disparity metrics, flagged criteria, statistical significance
- **Method:** Applies four-fifths rule + chi-square + Z-test + DIF analysis
- **Tools:** `calculate_selection_rates`, `calculate_impact_ratios`, `run_chi_square_test`, `run_dif_analysis`, `flag_disparate_criteria`
- **Thresholds:**
  - Four-fifths ratio < 0.80 → adverse impact indicated
  - Chi-square p < 0.05 → statistically significant
  - Z-test p < 0.05 → significant difference between two groups

#### Agent 4: Legal RAG Agent
- **Input:** Statistical findings from Statistics Agent
- **Output:** Legal analysis with citations
- **Method:** RAG over FHA text, HUD 2024 guidance, SafeRent ruling, Colorado AI Act
- **Tools:** `search_legal_knowledge_base`, `map_finding_to_violation`, `cite_precedent`
- **Knowledge base contents:**
  - Fair Housing Act (42 U.S.C. §§3601-3619)
  - HUD Guidance on Screening of Applicants (May 2024)
  - Louis v. SafeRent Solutions settlement terms
  - Colorado AI Act bias audit requirements
  - 10-Step Bias Elimination Audit framework

#### Agent 5: Report Generator
- **Input:** Statistical findings + legal analysis
- **Output:** FHA compliance report + executive summary
- **Method:** Generates structured report with citations
- **Tools:** `generate_fha_report`, `generate_executive_summary`, `generate_remediation_recommendations`
- **Report sections:**
  1. Executive Summary
  2. Methodology
  3. Findings by Protected Class
  4. Statistical Analysis (four-fifths ratios, chi-square, DIF)
  5. Legal Analysis (which FHA sections violated)
  6. Specific Failing Criteria
  7. Less Discriminatory Alternatives
  8. Remediation Recommendations
  9. Documentation for Legal Defense

### Shared State (invocation_state)

```python
audit_state = {
    "audit_id": "audit_2026_001",
    "city": "boston",
    "screening_tool": "mock_safe_rent",
    "protected_classes": ["source_of_income", "disability", "race"],
    "profiles_generated": 0,
    "submissions_completed": 0,
    "disparities_found": [],
    "current_phase": "profile_generation"
}
```

---

## 5. MOCK SCREENING TOOL (Demo)

For the hackathon demo, we build a mock screening tool that has KNOWN discriminatory logic built in:

### Mock Screening API

```python
# mock_screening_tool.py
# Deliberately discriminates against voucher holders and disability

PROTECTED_RATES = {
    "standard": 0.85,        # 85% approval for standard applicants
    "voucher_holder": 0.42,  # 42% approval for voucher holders (below 4/5 threshold)
    "disability": 0.55,      # 55% approval for disability accommodation requests
    "family_large": 0.60,    # 60% approval for families with 3+ children
}

def screen_applicant(profile: dict) -> dict:
    """Mock screening with built-in discrimination."""
    # Determine which rate applies based on profile
    if profile.get("source_of_income") == "housing_voucher":
        rate = PROTECTED_RATES["voucher_holder"]
    elif profile.get("disability_accommodation"):
        rate = PROTECTED_RATES["disability"]
    elif profile.get("num_children", 0) >= 3:
        rate = PROTECTED_RATES["family_large"]
    else:
        rate = PROTECTED_RATES["standard"]

    # Apply rate to determine outcome
    import random
    approved = random.random() < rate
    score = int(200 + (600 * rate) + random.gauss(0, 50))

    return {
        "decision": "approved" if approved else "denied",
        "score": max(200, min(800, score)),
        "factors": {
            "credit_score_weight": 0.35,
            "income_weight": 0.25,
            "rental_history_weight": 0.20,
            "debt_ratio_weight": 0.20
        },
        "denial_reasons": [] if approved else [
            "Credit score below threshold",
            "Debt-to-income ratio exceeds maximum"
        ]
    }
```

### Why This Works for Demo

- **Voucher holders:** 42% approval vs 85% standard → impact ratio = 0.49 (well below 0.80)
- **Disability:** 55% approval vs 85% standard → impact ratio = 0.65 (below 0.80)
- **Families:** 60% approval vs 85% standard → impact ratio = 0.71 (below 0.80)
- **All three exceed the four-fifths threshold** — agent will flag all three
- **Matches the SafeRent pattern** — voucher holders disproportionately denied

---

## 6. DATA MODEL

### Synthetic Applicant Profile

```python
@dataclass
class SyntheticProfile:
    profile_id: str
    # Demographics (protected class signals)
    first_name: str
    last_name: str
    race_signal: str           # race-signaling name category
    age: int
    # Application data (legitimate factors)
    income_monthly: int
    credit_score: int
    rental_history_years: int
    previous_evictions: int
    criminal_record: str       # "none" | "misdemeanor" | "felony"
    debt_ratio: float
    # Protected class signals
    source_of_income: str      # "employment" | "housing_voucher" | "ssi"
    disability_accommodation: bool
    num_children: int
    familial_status: str       # "single" | "couple" | "family"
    # Screening result
    decision: str              # "approved" | "denied"
    score: int
    denial_reasons: list[str]
```

### Audit Result

```python
@dataclass
class AuditResult:
    audit_id: str
    timestamp: str
    screening_tool: str
    city: str
    # Metrics
    total_profiles: int
    total_submissions: int
    # Disparities by protected class
    disparities: list[Disparity]
    # Legal analysis
    legal_findings: list[LegalFinding]
    # Report
    report_url: str

@dataclass
class Disparity:
    protected_class: str
    group_a_label: str         # e.g., "employment_income"
    group_b_label: str         # e.g., "housing_voucher"
    group_a_selection_rate: float
    group_b_selection_rate: float
    impact_ratio: float        # group_b / group_a
    four_fifths_violation: bool
    chi_square_p_value: float
    z_test_p_value: float
    statistical_significance: bool
    criteria_driving_disparity: list[str]
```

---

## 7. STRANDS SDK INTEGRATION

### Agent Creation

```python
from strands import Agent, tool
from strands.models import BedrockModel

model = BedrockModel(
    model_id="us.anthropic.claude-sonnet-4-20250514",
    region="us-east-1"
)

# Profile Generator Agent
@tool
def generate_profiles(
    count: int,
    protected_classes: list[str],
    city: str
) -> list[dict]:
    """Generate synthetic applicant profiles with controlled demographic variation.
    Args:
        count: Number of profiles to generate
        protected_classes: List of protected classes to vary
        city: Target city for realistic data
    """
    # Implementation: generate matched-pair profiles
    pass

profile_agent = Agent(
    model=model,
    name="profile_generator",
    description="Generates synthetic applicant profiles for fair housing testing",
    tools=[generate_profiles, validate_profile_distribution],
    system_prompt="""You are a profile generation specialist for fair housing testing.
    Generate synthetic applicant profiles that vary ONLY on protected-class dimensions
    while keeping legitimate qualification factors constant. Use validated race-signaling
    names from Bertrand & Mullainathan (2004) methodology."""
)

# Statistics Agent
@tool
def calculate_impact_ratios(
    results: list[dict],
    protected_class: str
) -> dict:
    """Calculate four-fifths impact ratios for a protected class.
    Args:
        results: List of screening results with profile metadata
        protected_class: The protected class to analyze
    """
    # Implementation: calculate selection rates and impact ratios
    pass

@tool
def run_statistical_tests(
    results: list[dict],
    group_a: str,
    group_b: str
) -> dict:
    """Run chi-square and Z-test for statistical significance.
    Args:
        results: List of screening results
        group_a: Label for the advantaged group
        group_b: Label for the disadvantaged group
    """
    # Implementation: chi-square + Z-test
    pass

stats_agent = Agent(
    model=model,
    name="statistics",
    description="Performs statistical analysis of screening results for disparate impact",
    tools=[calculate_impact_ratios, run_statistical_tests, run_dif_analysis],
    system_prompt="""You are a statistical analyst specializing in fair housing
    disparate impact analysis. Apply the four-fifths rule, chi-square tests,
    and differential item functioning analysis to detect discriminatory patterns."""
)

# Orchestrator
orchestrator = Agent(
    model=model,
    name="fairshield",
    tools=[
        profile_agent,   # Sub-agent as tool
        submission_agent, # Sub-agent as tool
        stats_agent,      # Sub-agent as tool
        legal_agent,      # Sub-agent as tool
        report_agent      # Sub-agent as tool
    ],
    system_prompt="""You are FairShield, an autonomous fair housing audit agent.
    Your job is to test AI tenant screening tools for discriminatory patterns
    across all 7 Fair Housing Act protected classes.

    Workflow:
    1. Generate synthetic applicant profiles across protected dimensions
    2. Submit profiles to the screening tool
    3. Analyze results for disparate impact
    4. Map findings to FHA violations
    5. Generate compliance report

    Only surface to the user when discrimination is detected or the audit is complete."""
)
```

### AgentCore Deployment

```python
# main.py
from strands import Agent
from bedrock_agentcore.runtime import BedrockAgentCoreApp

agent = Agent(...)  # FairShield orchestrator

app = BedrockAgentCoreApp(agent)
app.run()
```

```dockerfile
FROM --platform=linux/arm64 python:3.11-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
CMD ["python", "main.py"]
```

---

## 8. DEMO SCRIPT (3 Minutes)

### 0:00-0:30 — The Problem (Mary Louis Story)
> "In 2021, Mary Louis applied for an apartment in Massachusetts. She had a 17-year rental history, a steady job, and a housing voucher that covered 69% of her rent. The AI screening tool gave her a score of 324. The minimum needed was 443. Recommendation: DECLINE. She had no idea why. It took a class action lawsuit to discover the algorithm was systematically discriminating against voucher holders."

### 0:30-1:00 — The Gap
> "Fair housing organizations test for this manually. They send a few testers per week. Meanwhile, 80% of operators use AI screening, 33% have zero governance, and the enforcement wave is building — 32,321 fair housing complaints in 2024. The orgs are outgunned."

### 1:00-1:30 — The Solution
> "FairShield is an autonomous agent that runs the same tests a fair housing org would run — but at 10,000x the scale. It generates synthetic applicant profiles across all 7 protected classes, submits them to a screening tool, and detects statistical patterns of discrimination."

### 1:30-2:30 — Live Demo
1. Show mock screening tool dashboard (built for demo)
2. User clicks "Run Audit" → agent starts autonomously
3. Show profile generation (200 profiles across 7 dimensions)
4. Show submissions happening in real-time (2 minutes)
5. Agent surfaces: "Discrimination detected"
6. Show results: Voucher holders 42% vs 85% approval → impact ratio 0.49
7. Show legal analysis: "Matches pattern in Louis v. SafeRent Solutions"
8. Show compliance report with citations and remediation

### 2:30-3:00 — Impact
> "FairShield gives a 5-person fair housing org the power to test every screening tool in their city. Instead of testing 3 properties a week, they test 10,000 applicants across an entire market. The agent flags the discrimination. The humans decide what to do with it. That's the future of fair housing enforcement."

---

## 9. BUILD TIMELINE (34 Days)

### Week 1 (Aug 12-18): Foundation
- [ ] Set up Strands SDK environment
- [ ] Build mock screening tool with known discriminatory logic
- [ ] Implement Profile Generator agent with name-race methodology
- [ ] Basic agent orchestration (orchestrator + profile agent)

### Week 2 (Aug 19-25): Core Agents
- [ ] Submission agent (API-based, records all responses)
- [ ] Statistics agent (four-fifths rule + chi-square + Z-test)
- [ ] Test with 200 profiles → confirm disparity detection works

### Week 3 (Aug 26-Sep 1): Intelligence
- [ ] Legal RAG agent (knowledge base: FHA, HUD guidance, SafeRent)
- [ ] Report generator (FHA compliance report format)
- [ ] End-to-end audit flow working

### Week 4 (Sep 2-8): Polish
- [ ] Frontend dashboard (Next.js + Tailwind + shadcn/ui)
- [ ] AgentCore deployment
- [ ] Demo video recording
- [ ] README + architecture diagram

### Week 5 (Sep 9-15): Submission
- [ ] Final testing
- [ ] builder.aws post
- [ ] Submit to Devpost

---

## 10. TECHNICAL RISKS & MITIGATIONS

| Risk | Mitigation |
|---|---|
| Strands SDK learning curve | Start with simple agent, add complexity gradually |
| Statistical analysis correctness | Use numpy/scipy, validate against known examples |
| RAG knowledge base quality | Seed with actual HUD guidance text, SafeRent ruling |
| Demo mock tool feels fake | Make the discrimination pattern realistic (matches SafeRent data) |
| Scope creep | Strict MVP: 5 agents, mock tool, 200 profiles, basic report |
| AgentCore deployment complexity | Deploy last, test locally first |

---

## 11. COMPETITIVE MOAT

| What others will submit | What we submit |
|---|---|
| Food bank coordination | AI auditing AI |
| School notification systems | Court-cited legal analysis |
| Community resource matching | Statistical disparate impact detection |
| Neighborhood alerts | Autonomous adversarial testing at scale |

**No other team will build this.** The intersection of fair housing law + statistical analysis + multi-agent AI is a space no one else is thinking about for a hackathon.

---

## 12. SUCCESS METRICS

- [ ] Agent runs 200 profiles autonomously in < 3 minutes
- [ ] Correctly detects voucher holder discrimination (impact ratio < 0.80)
- [ ] Correctly detects disability discrimination (impact ratio < 0.80)
- [ ] Report includes legal citations (Louis v. SafeRent, HUD 2024 guidance)
- [ ] Deployed on AgentCore (or Lambda as fallback)
- [ ] Demo video < 3 minutes, clear problem → solution → demo → impact
- [ ] MIT license in repo
- [ ] Architecture diagram in README
