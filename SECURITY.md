# Security

## Reporting Vulnerabilities

Email **contact@terronex.dev** instead of opening a public issue. We will respond within 48 hours.

## Security Model

- Engram Trace operates on local `.engram` files. No data is sent externally unless you configure a cloud LLM provider for summarization.
- API keys are passed in configuration, never logged or stored by the library.
- The consolidation pipeline works without any external calls (LLM summarization is optional).

## Supported Versions

| Version | Supported |
|---------|-----------|
| 0.1.x   | Yes       |


## Important Notice

The encryption and key derivation implementations in this software have not been independently audited by a third-party security firm. While we follow established cryptographic standards (AES-256-GCM, argon2id, PBKDF2), users handling sensitive data should perform their own security assessment before relying on these protections in production.
