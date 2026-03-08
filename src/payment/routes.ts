import { Hono } from 'hono';
import type { JWTPayload } from '../auth/jwt';
import type { UserStore, TierUsageStore, Tier } from '../storage/interfaces';

type Env = {
  Variables: {
    user: JWTPayload;
  };
};

export interface PaymentRouteDeps {
  userStore: UserStore;
  tierUsageStore: TierUsageStore;
  jwtSecret: string;
  stripeSecretKey: string;
  stripeWebhookSecret: string;
  stripePriceStarterMonthly: string;
  stripePriceStarterAnnual: string;
  stripePriceGrowthMonthly: string;
  stripePriceGrowthAnnual: string;
  dashboardUrl: string;
  marketingUrl: string;
}

// ---------------------------------------------------------------------------
// Stripe HMAC-SHA256 signature verification using Web Crypto API
// ---------------------------------------------------------------------------

async function verifyStripeSignature(
  payload: string,
  sigHeader: string,
  secret: string
): Promise<boolean> {
  // Stripe-Signature header format: t=timestamp,v1=sig1,v1=sig2,...
  const parts = sigHeader.split(',');
  let timestamp = '';
  const signatures: string[] = [];

  for (const part of parts) {
    const [key, value] = part.split('=');
    if (key === 't') {
      timestamp = value;
    } else if (key === 'v1') {
      signatures.push(value);
    }
  }

  if (!timestamp || signatures.length === 0) return false;

  // Reject if timestamp is older than 5 minutes
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - parseInt(timestamp, 10)) > 300) return false;

  const signedPayload = `${timestamp}.${payload}`;
  const encoder = new TextEncoder();
  const keyData = encoder.encode(secret);
  const messageData = encoder.encode(signedPayload);

  const key = await crypto.subtle.importKey(
    'raw',
    keyData,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const signatureBuffer = await crypto.subtle.sign('HMAC', key, messageData);
  const computedSig = Array.from(new Uint8Array(signatureBuffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');

  return signatures.some((sig) => sig === computedSig);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function createPaymentRoutes(deps: PaymentRouteDeps, authMw: (c: any, next: any) => Promise<void | Response>) {
  const {
    userStore,
    tierUsageStore,
    stripeSecretKey,
    stripeWebhookSecret,
    stripePriceStarterMonthly,
    stripePriceStarterAnnual,
    stripePriceGrowthMonthly,
    stripePriceGrowthAnnual,
    dashboardUrl,
    marketingUrl,
  } = deps;

  const app = new Hono<Env>();

  // ----------------------------------------------------------------
  // POST /payment/create-checkout-session
  // Protected by JWT. Creates a Stripe Checkout session.
  // Body: { plan: 'starter' | 'growth', billing: 'monthly' | 'annual' }
  // ----------------------------------------------------------------
  app.post('/payment/create-checkout-session', authMw, async (c) => {
    const jwtPayload = c.get('user');
    const user = await userStore.findByEmail(jwtPayload.email);
    if (!user) {
      return c.json({ error: 'User not found' }, 404);
    }

    const body = (await c.req.json().catch(() => ({}))) as {
      plan?: string;
      billing?: string;
    };

    const plan = body.plan;
    const billing = body.billing ?? 'monthly';

    if (plan !== 'starter' && plan !== 'growth') {
      return c.json({ error: 'plan must be starter or growth' }, 400);
    }
    if (billing !== 'monthly' && billing !== 'annual') {
      return c.json({ error: 'billing must be monthly or annual' }, 400);
    }

    let priceId: string;
    if (plan === 'starter' && billing === 'monthly') priceId = stripePriceStarterMonthly;
    else if (plan === 'starter' && billing === 'annual') priceId = stripePriceStarterAnnual;
    else if (plan === 'growth' && billing === 'monthly') priceId = stripePriceGrowthMonthly;
    else priceId = stripePriceGrowthAnnual;

    if (!priceId) {
      return c.json({ error: 'Stripe price ID not configured for this plan' }, 500);
    }

    const params = new URLSearchParams({
      'payment_method_types[]': 'card',
      'mode': 'subscription',
      'line_items[0][price]': priceId,
      'line_items[0][quantity]': '1',
      'success_url': `${dashboardUrl}/settings?stripe_session_id={CHECKOUT_SESSION_ID}`,
      'cancel_url': `${marketingUrl}/pricing`,
      'customer_email': user.email ?? '',
      'metadata[org_id]': user.orgId ?? '',
      'metadata[tier]': plan,
    });

    const response = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${stripeSecretKey}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    });

    if (!response.ok) {
      const err = await response.text();
      return c.json({ error: `Stripe error: ${err}` }, 502);
    }

    const session = await response.json() as { id: string; url: string };
    return c.json({ sessionId: session.id, url: session.url });
  });

  // ----------------------------------------------------------------
  // GET /payment/portal
  // Protected by JWT. Redirects to the Stripe Customer Portal.
  // ----------------------------------------------------------------
  app.get('/payment/portal', authMw, async (c) => {
    const jwtPayload = c.get('user');
    const user = await userStore.findByEmail(jwtPayload.email);
    if (!user) {
      return c.json({ error: 'User not found' }, 404);
    }

    // Look up Stripe customer by email
    const customerSearchRes = await fetch(
      `https://api.stripe.com/v1/customers?email=${encodeURIComponent(user.email ?? '')}&limit=1`,
      {
        headers: {
          'Authorization': `Bearer ${stripeSecretKey}`,
        },
      }
    );

    if (!customerSearchRes.ok) {
      return c.json({ error: 'Failed to look up Stripe customer' }, 502);
    }

    const customerData = await customerSearchRes.json() as { data: Array<{ id: string }> };
    const customerId = customerData.data[0]?.id;
    if (!customerId) {
      return c.json({ error: 'No Stripe customer found for this account' }, 404);
    }

    // Create a billing portal session
    const portalRes = await fetch('https://api.stripe.com/v1/billing_portal/sessions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${stripeSecretKey}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        'customer': customerId,
        'return_url': `${dashboardUrl}/settings`,
      }).toString(),
    });

    if (!portalRes.ok) {
      const err = await portalRes.text();
      return c.json({ error: `Stripe portal error: ${err}` }, 502);
    }

    const portal = await portalRes.json() as { url: string };
    return c.json({ url: portal.url });
  });

  // ----------------------------------------------------------------
  // POST /webhook/stripe
  // No auth — verified by Stripe-Signature header.
  // Handles checkout.session.completed to upgrade org tier.
  // ----------------------------------------------------------------
  app.post('/webhook/stripe', async (c) => {
    const sigHeader = c.req.header('stripe-signature') ?? '';
    const rawBody = await c.req.text();

    const valid = await verifyStripeSignature(rawBody, sigHeader, stripeWebhookSecret);
    if (!valid) {
      return c.json({ error: 'Invalid signature' }, 400);
    }

    let event: { type: string; data: { object: Record<string, unknown> } };
    try {
      event = JSON.parse(rawBody);
    } catch {
      return c.json({ error: 'Invalid JSON' }, 400);
    }

    if (event.type === 'checkout.session.completed') {
      const session = event.data.object;
      const metadata = session['metadata'] as Record<string, string> | undefined;
      const orgId = metadata?.['org_id'];
      const tier = metadata?.['tier'] as Tier | undefined;

      if (orgId && tier && ['free', 'starter', 'growth', 'enterprise'].includes(tier)) {
        // Update all users in this org to the new tier
        const users = await userStore.listByOrg(orgId);
        await Promise.all(
          users.map((u) => userStore.update(u.userId, { tier }))
        );
      }
    }

    return c.json({ received: true });
  });

  return app;
}
