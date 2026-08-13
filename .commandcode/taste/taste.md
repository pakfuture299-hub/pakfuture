# Taste Profile
See [taste-profile/taste.md](taste-profile/taste.md)

## Platform & Integration Debugging
- When an n8n webhook flow routes into the Reject/validation-failure branch even though the test payload contains all required fields, the user's echoed webhook response itself is the ground truth for the data shape: fields live under `body.name` / `body.phone` (the webhook wrapper `{headers, params, query, body, webhookUrl, executionMode}`), not at the top level of `$json` — so downstream nodes must reference `$json.body.<field>` after a webhook node, not `$json.<field>`. Confirmed to extend to every downstream consumer of the webhook payload, including Code/Normalize nodes reading `$input.first().json` (`item.<field>` must become `item.body.<field>`; otherwise only the node's fallback-derived fields land while body-passed fields stay blank) — the wrapper indirection is the recurring cause of "some columns blank / only fallbacks written" symptoms in these flows. Confidence: 0.8
