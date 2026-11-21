import { createClient, SupabaseClient, User } from '@supabase/supabase-js';
import { QuotationData, BillingStatementData } from './storage';
import { PaverItem } from '../data/paverCatalog';

function normalizeEnvValue(raw: string): string {
  const trimmed = raw.trim();
  if (
    trimmed.length >= 2 &&
    ((trimmed.startsWith('"') && trimmed.endsWith('"')) ||
      (trimmed.startsWith("'") && trimmed.endsWith("'")))
  ) {
    return trimmed.slice(1, -1).trim();
  }
  return trimmed;
}

function normalizeSupabaseUrl(raw: string): string {
  const cleaned = normalizeEnvValue(raw);
  if (!cleaned) return '';
  try {
    const parsed = new URL(cleaned);
    return parsed.origin;
  } catch {
    return cleaned.replace(/\/+$/, '');
  }
}

const rawSupabaseUrl =
  import.meta.env.VITE_SUPABASE_URL ||
  import.meta.env.NEXT_PUBLIC_SUPABASE_URL ||
  import.meta.env.SUPABASE_URL || '';

const rawSupabaseAnonKey =
  import.meta.env.VITE_SUPABASE_ANON_KEY ||
  import.meta.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  import.meta.env.SUPABASE_ANON_KEY || '';

const supabaseUrl = normalizeSupabaseUrl(rawSupabaseUrl);
const supabaseAnonKey = normalizeEnvValue(rawSupabaseAnonKey);

export const isSupabaseConfigured = (): boolean => {
  return Boolean(
    supabaseUrl &&
    supabaseAnonKey &&
    supabaseUrl.startsWith('https://') &&
    supabaseAnonKey.length > 20
  );
};

// Create client or null if not yet configured
export const supabase: SupabaseClient | null = isSupabaseConfigured()
  ? createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
      },
    })
  : null;

// =============================================================================
// Auth Helpers & Email Whitelist
// =============================================================================

export function getAllowedEmailsFromEnv(): string[] {
  const raw = normalizeEnvValue(import.meta.env.VITE_ALLOWED_EMAILS || '');
  if (!raw) return [];
  return raw
    .split(/[,;\n]+/)
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
}

export async function checkUserEmailAllowed(
  email?: string | null
): Promise<{ allowed: boolean; reason?: string }> {
  const normalizedEmail = (email || '').trim().toLowerCase();
  if (!normalizedEmail) {
    return {
      allowed: false,
      reason: 'No email address was returned by your Google account.',
    };
  }

  const envAllowedEmails = getAllowedEmailsFromEnv();
  const envMatched = envAllowedEmails.length > 0 && envAllowedEmails.includes(normalizedEmail);

  if (envAllowedEmails.length > 0 && !envMatched) {
    return {
      allowed: false,
      reason: `${normalizedEmail} is not on the authorized email list.`,
    };
  }

  if (supabase) {
    const { data, error } = await supabase
      .from('allowed_emails')
      .select('email')
      .ilike('email', normalizedEmail)
      .maybeSingle();

    if (!error) {
      if (data) {
        return { allowed: true };
      }
      return {
        allowed: false,
        reason: `${normalizedEmail} is not authorized to access this workspace. Ask an admin to add it to allowed_emails in Supabase.`,
      };
    }

    console.warn('Error checking allowed_emails in Supabase:', error.message);
    if (envMatched) {
      return { allowed: true };
    }
    return {
      allowed: false,
      reason:
        'Authorized email list is not configured in Supabase yet. Run the updated supabase/schema.sql and add your email to allowed_emails.',
    };
  }

  return envMatched
    ? { allowed: true }
    : {
        allowed: false,
        reason: 'Supabase is not configured.',
      };
}

export async function signInWithGoogle() {
  if (!supabase) {
    throw new Error('Supabase is not configured yet. Please add your credentials in environment variables.');
  }
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: window.location.origin,
      queryParams: { prompt: 'select_account' },
    },
  });
  if (error) throw error;
  return data;
}

export async function getCurrentUser(): Promise<User | null> {
  if (!supabase) return null;
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}

export async function signInWithEmail(email: string, password: string) {
  if (!supabase) throw new Error('Supabase is not configured yet. Please add your credentials in .env.local');
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
}

export async function signUpWithEmail(email: string, password: string, fullName?: string) {
  if (!supabase) throw new Error('Supabase is not configured yet. Please add your credentials in .env.local');
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        full_name: fullName || email.split('@')[0],
      },
    },
  });
  if (error) throw error;
  return data;
}

export async function signOutUser() {
  if (!supabase) return;
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

// =============================================================================
// Quotations Cloud Sync Helpers
// =============================================================================

export function mapDbRecordToQuotation(rec: any): QuotationData {
  const rawDiscount = rec.discount || {
    enabled: false,
    type: 'percentage',
    value: 0,
    amount: 0,
    label: '',
  };
  const { _vatConfig, _termsFontSize, ...cleanDiscount } = rawDiscount;

  return {
    id: rec.id,
    quotationNumber: rec.quotation_number,
    date: rec.date || '',
    clientName: rec.client_name || '',
    companyName: rec.company_name || '',
    projectName: rec.project_name || '',
    projectLocation: rec.project_location || '',
    tableHeaderTitle: rec.table_header_title || 'Paver (Delivered)',
    items: rec.items || [],
    discount: cleanDiscount,
    delivery: rec.delivery || {
      enabled: false,
      description: '',
      deliveriesCount: '',
      amount: 0,
    },
    vatConfig: rec.vat_config || _vatConfig || {
      enabled: true,
      rate: 12,
      label: 'Plus: 12% Vat',
      showZeroVatRow: true,
    },
    termsFontSize: rec.terms_font_size || _termsFontSize || 9.2,
    termsAndConditions: rec.terms_page1 || '',
    termsPage1: rec.terms_page1 || '',
    termsPage2: rec.terms_page2 || '',
    paymentDetails: rec.payment_details || {
      payableTo: 'Kuma Concrete Inc.',
      bankName: 'BDO (Banco de Oro)',
      accountNumber: '008590004762',
      accountName: 'Kuma Concrete Inc.',
    },
    signatory: rec.signatory || {
      name: 'Enrico G. Vazquez',
      title: 'President',
    },
    createdByUserId: rec.created_by_user_id,
    createdByEmail: rec.created_by_email,
    createdByName: rec.created_by_name,
    createdAt: rec.created_at ? new Date(rec.created_at).getTime() : Date.now(),
    updatedAt: rec.updated_at ? new Date(rec.updated_at).getTime() : Date.now(),
  };
}

export async function fetchCloudQuotations(): Promise<QuotationData[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('quotations')
    .select('*')
    .order('updated_at', { ascending: false });

  if (error) {
    console.error('Error fetching quotations from Supabase:', error);
    throw error;
  }

  return (data || [])
    .filter((rec: any) => !(rec.id?.startsWith('billing-') || rec.discount?._recordType === 'billing'))
    .map(mapDbRecordToQuotation);
}

export async function saveCloudQuotation(
  quote: QuotationData,
  user?: User | null
): Promise<void> {
  if (!supabase) return;

  const userEmail = user?.email || quote.createdByEmail || '';
  const userName = user?.user_metadata?.full_name || quote.createdByName || userEmail.split('@')[0] || '';
  const userId = user?.id || quote.createdByUserId || null;

  const dbPayload = {
    id: quote.id,
    quotation_number: quote.quotationNumber,
    date: quote.date,
    client_name: quote.clientName,
    company_name: quote.companyName || '',
    project_name: quote.projectName,
    project_location: quote.projectLocation,
    table_header_title: quote.tableHeaderTitle || 'Paver (Delivered)',
    items: quote.items,
    discount: {
      ...quote.discount,
      _vatConfig: quote.vatConfig,
      _termsFontSize: quote.termsFontSize,
    },
    delivery: quote.delivery,
    terms_page1: quote.termsPage1,
    terms_page2: quote.termsPage2,
    payment_details: quote.paymentDetails,
    signatory: quote.signatory,
    created_by_user_id: userId,
    created_by_email: userEmail,
    created_by_name: userName,
    updated_at: new Date().toISOString(),
  };

  const { error } = await supabase
    .from('quotations')
    .upsert(dbPayload, { onConflict: 'id' });

  if (error) {
    console.error('Error saving quotation to Supabase:', error);
    throw error;
  }
}

export async function deleteCloudQuotation(id: string): Promise<void> {
  if (!supabase) return;
  const { error } = await supabase
    .from('quotations')
    .delete()
    .eq('id', id);

  if (error) {
    console.error('Error deleting quotation from Supabase:', error);
    throw error;
  }
}

// =============================================================================
// Billing Statements Cloud Sync Helpers (stored cleanly via existing quotations table JSONB)
// =============================================================================

export async function fetchCloudBillingStatements(): Promise<BillingStatementData[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('quotations')
    .select('*')
    .order('updated_at', { ascending: false });

  if (error) {
    console.error('Error fetching billing statements from Supabase:', error);
    throw error;
  }

  return (data || [])
    .filter((rec: any) => rec.id?.startsWith('billing-') || rec.discount?._recordType === 'billing')
    .map((rec: any) => {
      if (rec.discount?._billingData) {
        return rec.discount._billingData as BillingStatementData;
      }
      return {
        id: rec.id,
        billingNumber: rec.quotation_number || '',
        referenceQuotationNumber: '',
        date: rec.date || '',
        clientName: rec.client_name || '',
        companyName: rec.company_name || '',
        projectName: rec.project_name || '',
        projectLocation: rec.project_location || '',
        tableHeaderTitle: rec.table_header_title || 'Billing',
        itemSummaryText: '',
        contractAmount: 0,
        payments: [],
        padFourPaymentSlots: true,
        latePaymentNote: '* KUMA CONCRETE has the right to charge 2% interest per month on late payments',
        paymentDetails: rec.payment_details || {
          payableTo: 'Kuma Concrete Inc.',
          bankName: 'BDO',
          accountNumber: '008590004762',
          accountName: 'Kuma Concrete Inc.',
        },
        signatory: rec.signatory || { name: 'Enrico G. Vazquez', title: 'President' },
        createdByUserId: rec.created_by_user_id,
        createdByEmail: rec.created_by_email,
        createdByName: rec.created_by_name,
        createdAt: rec.created_at ? new Date(rec.created_at).getTime() : Date.now(),
        updatedAt: rec.updated_at ? new Date(rec.updated_at).getTime() : Date.now(),
      } as BillingStatementData;
    });
}

export async function saveCloudBillingStatement(
  billing: BillingStatementData,
  user?: User | null
): Promise<void> {
  if (!supabase) return;

  const userEmail = user?.email || billing.createdByEmail || '';
  const userName =
    user?.user_metadata?.full_name || billing.createdByName || userEmail.split('@')[0] || '';
  const userId = user?.id || billing.createdByUserId || null;

  const billingWithAuthor: BillingStatementData = {
    ...billing,
    createdByUserId: userId || undefined,
    createdByEmail: userEmail,
    createdByName: userName,
    updatedAt: Date.now(),
  };

  const dbPayload = {
    id: billing.id,
    quotation_number: billing.billingNumber,
    date: billing.date,
    client_name: billing.clientName,
    company_name: billing.companyName || '',
    project_name: billing.projectName,
    project_location: billing.projectLocation,
    table_header_title: billing.tableHeaderTitle || 'Billing',
    items: [],
    discount: {
      enabled: false,
      type: 'percentage',
      value: 0,
      amount: 0,
      _recordType: 'billing',
      _billingData: billingWithAuthor,
    },
    delivery: {
      enabled: false,
      description: '',
      deliveriesCount: '',
      amount: 0,
    },
    payment_details: billing.paymentDetails,
    signatory: billing.signatory,
    created_by_user_id: userId,
    created_by_email: userEmail,
    created_by_name: userName,
    updated_at: new Date().toISOString(),
  };

  const { error } = await supabase
    .from('quotations')
    .upsert(dbPayload, { onConflict: 'id' });

  if (error) {
    console.error('Error saving billing statement to Supabase:', error);
    throw error;
  }
}

export async function deleteCloudBillingStatement(id: string): Promise<void> {
  return deleteCloudQuotation(id);
}

// =============================================================================
// Price List (Paver Catalog) Cloud Sync Helpers
// =============================================================================

export async function syncPriceListToCloud(catalog: PaverItem[], user?: User | null): Promise<void> {
  if (!supabase) throw new Error('Supabase is not configured');
  const userEmail = user?.email || 'Admin';

  const { error } = await supabase
    .from('paver_catalog')
    .upsert({
      id: 'default',
      catalog_data: catalog,
      updated_by_email: userEmail,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'id' });

  if (error) {
    console.error('Error syncing price list to Supabase:', error);
    throw error;
  }
}

export async function fetchPriceListFromCloud(): Promise<{ catalog: PaverItem[]; updatedBy?: string; updatedAt?: string } | null> {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('paver_catalog')
    .select('*')
    .eq('id', 'default')
    .maybeSingle();

  if (error) {
    console.error('Error fetching price list from Supabase:', error);
    throw error;
  }

  if (!data || !Array.isArray(data.catalog_data)) return null;

  return {
    catalog: data.catalog_data as PaverItem[],
    updatedBy: data.updated_by_email,
    updatedAt: data.updated_at,
  };
}
