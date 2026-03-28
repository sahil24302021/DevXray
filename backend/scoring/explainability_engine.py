from typing import Dict, Any, List

def generate_score_explanation(
    raw_scores: Dict[str, float],
    weights: Dict[str, float],
    penalty: int,
    penalty_details: List[Dict[str, Any]]
) -> Dict[str, Any]:
    """
    Generates a deeply transparent trace of exactly how the final score was computed.
    Provides feature importance and a step-by-step decision log.
    """
    weighted_contributions = {}
    feature_importance = []
    decision_trace = []

    raw_final = 0.0

    # Sort components by weight to show highest impact first
    sorted_components = sorted(weights.items(), key=lambda x: x[1], reverse=True)

    for comp, weight in sorted_components:
        raw_val = raw_scores.get(comp, 0.0)
        contrib = round(raw_val * weight, 1)
        raw_final += contrib
        weighted_contributions[comp] = contrib

        feature_importance.append({
            "component": comp,
            "weight": weight,
            "raw_score": round(raw_val, 1),
            "contribution": contrib,
            "impact_level": "HIGH" if weight >= 0.2 else "MEDIUM" if weight >= 0.1 else "LOW"
        })

        decision_trace.append(
            f"[{comp.upper()}] Base score of {round(raw_val, 1)} multiplied by weight {weight} -> +{contrib} pts"
        )
    
    if penalty > 0:
        decision_trace.append(f"[PENALTY] Applied {penalty} point reduction due to risk flags.")
        for p in penalty_details:
            decision_trace.append(f"  -> {p['severity']} FLAG: {p['flag']} (-{p['penalty_points']} pts)")

    final = max(0.0, min(100.0, round(raw_final - penalty, 1)))
    decision_trace.append(f"[FINAL] {round(raw_final, 1)} - {penalty} = {final}")

    return {
        "final_score": final,
        "raw_total_before_penalty": round(raw_final, 1),
        "breakdown": weighted_contributions,
        "feature_importance": feature_importance,
        "risk_penalty": penalty,
        "penalty_details": penalty_details,
        "decision_trace": decision_trace
    }
