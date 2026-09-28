import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { getNeonClient, ensureSchema } from '@/lib/db';
import { encryptApiKey } from '@/lib/byok-crypto';
import { isKnownProvider } from '@/lib/ai-providers';
import logger from '@/lib/log';

export const runtime = 'nodejs';

interface UserAiKeyRow {
    provider: string;
    updated_at: string | Date;
}

/**
 * GET /api/settings/ai-key
 *
 * Returns whether the signed-in user has a personal AI key on file, and
 * which provider it's for — never the key itself.
 */
export async function GET(): Promise<NextResponse> {
    const session = await auth();
    if (!session?.user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    // Use stable userId (GitHub numeric ID) as primary, email as fallback for BYOK key storage
    const userEmail = session.user?.email ?? session.userId;
    if (!userEmail) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const db = getNeonClient();
        await ensureSchema(db);
        const rows = (await db`
            SELECT provider, updated_at FROM user_ai_keys WHERE user_email = ${userEmail} LIMIT 1
        `) as UserAiKeyRow[];

        if (rows.length === 0) {
            return NextResponse.json({ hasKey: false });
        }
        return NextResponse.json({
            hasKey: true,
            provider: rows[0].provider,
            updatedAt: rows[0].updated_at,
        });
    } catch (error) {
        logger.warn('Failed to read BYOK settings:', error);
        return NextResponse.json({ error: 'Failed to read settings' }, { status: 500 });
    }
}

/**
 * POST /api/settings/ai-key
 * Body: { provider: 'gemini' | 'openai' | 'anthropic', apiKey: string }
 *
 * Saves (or replaces) the signed-in user's own AI provider key. The
 * plaintext key is encrypted before it ever reaches the database and is
 * never echoed back in any response.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
    const session = await auth();
    if (!session?.user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    // Use stable userId (GitHub numeric ID) as primary, email as fallback for BYOK key storage
    const userEmail = session.user?.email ?? session.userId;
    if (!userEmail) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    let body: unknown;
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({ error: 'Malformed request body' }, { status: 400 });
    }

    const { provider, apiKey } = (body as Record<string, unknown>) ?? {};
    if (!isKnownProvider(provider)) {
        return NextResponse.json({ error: 'provider must be one of: gemini, openai, anthropic' }, { status: 400 });
    }
    if (typeof apiKey !== 'string' || apiKey.trim().length < 8) {
        return NextResponse.json({ error: 'apiKey looks too short to be valid' }, { status: 400 });
    }

    try {
        const encrypted = encryptApiKey(apiKey.trim());
        const db = getNeonClient();
        await ensureSchema(db);
        await db`
            INSERT INTO user_ai_keys (user_email, provider, api_key_encrypted, updated_at)
            VALUES (${userEmail}, ${provider}, ${encrypted}, NOW())
            ON CONFLICT (user_email)
            DO UPDATE SET provider = ${provider}, api_key_encrypted = ${encrypted}, updated_at = NOW()
        `;
        return NextResponse.json({ success: true, provider });
    } catch (error) {
        logger.warn('Failed to save BYOK key:', error);
        const message = error instanceof Error ? error.message : 'Unknown error';
        // BYOK_ENCRYPTION_KEY missing is a server misconfiguration, not a
        // client mistake — surface it distinctly so it doesn't read like a
        // malformed key from the user's side.
        if (message.includes('BYOK_ENCRYPTION_KEY')) {
            return NextResponse.json({ error: 'AI key storage is not configured on this server yet' }, { status: 503 });
        }
        return NextResponse.json({ error: 'Failed to save your AI key' }, { status: 500 });
    }
}

/**
 * DELETE /api/settings/ai-key
 *
 * Removes the signed-in user's personal AI key; subsequent AI use falls
 * back to the app's shared/default provider.
 */
export async function DELETE(): Promise<NextResponse> {
    const session = await auth();
    if (!session?.user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    // Use stable userId (GitHub numeric ID) as primary, email as fallback for BYOK key storage
    const userEmail = session.user?.email ?? session.userId;
    if (!userEmail) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const db = getNeonClient();
        await ensureSchema(db);
        await db`DELETE FROM user_ai_keys WHERE user_email = ${userEmail}`;
        return NextResponse.json({ success: true });
    } catch (error) {
        logger.warn('Failed to delete BYOK key:', error);
        return NextResponse.json({ error: 'Failed to remove your AI key' }, { status: 500 });
    }
}
