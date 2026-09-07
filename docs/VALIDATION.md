# Validation boundary

The alpha candidate passed **51 automated tests across six files**, using Node 24.20.0. The app/source bytes are listed in [CODE_SHA256SUMS.txt](../evidence/CODE_SHA256SUMS.txt). Checks cover synthetic accounting, rejected authority/actions/history, exact served assets, local HTTP restrictions, media header limits, strict simulation configuration and deterministic build collection. A supervised static build wrote and rehashed all 13 output files.

Current browser checks verified configuration status, website-to-app/return navigation, synthetic Commons startup, phone-width app/site layouts without horizontal overflow, and no captured warning/error messages. The prior website/media snapshot passed 44 automated tests plus seven browser checks including a real PNG preview/removal and an unchanged canonical export. Those historical checks are scoped to that snapshot; they were not all rerun for alpha naming/configuration changes.

Actual MP4/WebM playback, valid JPEG/WebP browser decoding, media lifecycle races/BFCache restoration, downloaded export-file contents and comprehensive accessibility remain unverified. Unit tests for candidate media headers are not codec or malware certification. No production contracts or network behavior were tested. No independent person or independently implemented protocol has reproduced these results yet.

The first test-launch attempt was refused by the sandbox's operating-system memory query. No app started in that attempt. The existing bounded supervisor subsequently ran with access to the required system check and passed. Earlier historical failed tests and low-memory refusals remain preserved locally, not erased.

The public package has no third-party dependencies, private runtime or installation script. A successful build does not demonstrate a hosted site, testnet deployment, chain security, permanent storage or community acceptance.
