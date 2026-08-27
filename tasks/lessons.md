# Development Lessons

## 1. Extension Currency & Data Sensing
- **Pattern**: When extracting currency from Google Maps / travel sites, NEVER infer currency from destination location keywords (e.g. assuming Bangkok = THB). The user may be browsing via an IP/proxy in Singapore (seeing S$/SGD) or have account currency set to USD/EUR.
- **Rule**: Currency sensing MUST prioritize the literal DOM price strings, currency symbols, and active page domain/session currency rendered on the user's screen.
