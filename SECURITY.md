# Security process

This is a community implementation under review. No audit, external peer-review completion, production security or surveillance-resistance claim is made.

For local development, review code before running it, pin tools, keep secrets and research outside application artifacts, bind preview services to loopback and use synthetic data. Record meaningful tests and actual failure results. A passing scan or matching file hash is limited evidence, not a security assessment.

The security-control table tracks all 19 controls from the adopted build instructions with applicability, implementation, test evidence, residual risk and source-compliance consequences. Controls not yet relevant to the fixture server are deferred, not silently passed.

Production gates include authorization and replay tests; actual token/custody behavior; full authority and wiring graphs; private-message key/transfer semantics; reconstructable public history; sustainable independent submission; dependency/license review; and evidence from people or implementations genuinely independent of this agent team.

If a suspected vulnerability involves live third-party infrastructure, do not attack it or publish a usable exploit here. Preserve a restricted, redacted report and propose a responsible-disclosure destination and scope for approval. No contact address or bug bounty has been configured; do not invent one. Exposed secrets require authorized revocation/rotation and a recorded cleanup assessment. No automatic history rewrite or deletion is permitted.

Public releases must state exactly what was implemented, tested, independently reproduced and left unresolved, with pinned source/deployment versions. Apply the same standard to this implementation as to every reference implementation.
