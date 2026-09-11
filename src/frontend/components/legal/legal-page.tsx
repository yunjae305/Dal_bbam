import { LegalDocument } from '@/frontend/components/legal/legal-document';
import type { LegalPolicy } from '@/shared/legal-messages';

/** Operator metadata is resolved on the server, then displayed in the active locale. */
export function LegalPage({ policy }: { policy: LegalPolicy }) {
  return <LegalDocument
    policy={policy}
    operator={process.env.PUBLIC_OPERATOR_NAME?.trim() || null}
    contact={process.env.PRIVACY_CONTACT_EMAIL?.trim() || null}
    effectiveDate={process.env.LOCATION_TERMS_EFFECTIVE_DATE?.trim() || null}
  />;
}
