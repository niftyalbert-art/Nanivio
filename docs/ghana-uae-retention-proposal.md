# Ghana / UAE retention proposal — not yet an approved customer policy

## Approval status

On 2026-11-10, the owner approved **“Use as draft”** for this schedule,
including the proposed 90-day ordinary security-log period. This is approval
to use a working draft, not authorization for production purging, live retention
changes, publication as customer terms, or a push/deployment. Entity-specific
legal/accounting confirmation and the necessity assessment remain outstanding.

The owner identifies Ghana and the UAE as Nanivio's countries of operation or
legal base. This does not establish the exact incorporated entity, tax residency,
UAE free zone, applicable licences, or registration with a data-protection regulator.

## Source-backed requirements

- **Ghana tax records:** Revenue Administration Act 2016, Act 915, section 27,
  requires relevant documents for **at least six years from the relevant date**.
  For income tax this relates to the end of the relevant year of assessment;
  VAT and other taxes have their own relevant-date definitions. Disputes,
  applications, refunds, investigations and written directions can require longer
  retention. Do not calculate every expiry from the account-deletion date.
  Section 27 also addresses maintaining the necessary records within Ghana;
  the location/availability of required tax records needs legal/accounting review.
  This finding does not authorize changing Nanivio's Render/Supabase hosting.
- **UAE corporate-tax records:** the Federal Tax Authority states that records
  and documents should be kept for **at least seven years following the end of
  the relevant Tax Period**. This is not a blanket instruction to retain all
  customer communications for seven years, nor a complete statement of VAT or
  other recordkeeping obligations.
- **UAE privacy scope:** Federal Decree-Law 45/2021 excludes establishments in
  free zones that have special personal-data-protection legislation. Exact
  entity/free-zone applicability must be established; do not automatically apply
  the federal privacy law to a DIFC/ADGM entity.
- **Privacy and minimization:** assess the applicable Ghana/UAE privacy rules
  separately from tax retention. Only preserve personal data needed for a
  documented purpose or legal exception. Account erasure must not silently turn
  into indefinite retention of all profiles, voices or private conversations.

## Proposed engineering behaviour

1. Erase account profile/login, saved voice and private assistant data through a
   verified, retryable fulfillment process. Intake alone is not erasure.
2. Keep only necessary invoice, payment, tax and dispute evidence under the
   applicable entity's retention schedule. Where the same record is subject to
   multiple actual duties, retain it to the latest applicable expiry.
3. Store a record's retention basis, relevant period end, calculated expiry and
   any documented legal hold separately from normal app access.
4. **Security logs: draft period of 90 days** for ordinary operational logs,
   approved for draft use only and subject to an actual necessity assessment
   before adoption. This is an engineering proposal,
   not a Ghana/UAE statutory period. Cases under investigation require a
   documented, reviewed exception rather than a blanket indefinite hold.
5. Backups and provider copies need a documented, verified lifecycle. Do not
   promise a backup-deletion deadline until the actual provider/account settings
   have been checked. A restore must not resurrect erased customer data.
6. No production purge or seven-year blanket retention is enabled by this
   document. Obtain owner/legal review before adopting these as public terms.
   Users in other countries may create additional obligations; this is not a
   worldwide compliance certification.

## Official sources checked on 2026-11-10

- Ghana Revenue Authority, Act 915:
  https://gra.gov.gh/wp-content/uploads/2023/01/Revenue-Administration-Act-2016-.pdf
- UAE Federal Tax Authority, corporate-tax record retention FAQ:
  https://tax.gov.ae/en/faq.aspx?keyword=How+long+must+I+keep+my+records+for+UAE+CT+purposes%3f
- UAE Federal Decree-Law 45/2021, especially Articles 2, 5 and 15:
  https://uaelegislation.gov.ae/en/legislations/1972
- Ghana Data Protection Commission, Act 843, section 24:
  https://dataprotection.org.gh/wp-content/uploads/2025/05/data-protection-act-2012-act-843.pdf
