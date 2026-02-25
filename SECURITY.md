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
