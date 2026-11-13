import 'dotenv/config';
import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';
import { createServer as createViteServer } from 'vite';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT) || 3000;
const VALID_CURRENCIES = ['INR', 'USD', 'EUR', 'JPY'] as const;
const VALID_CATEGORIES = [
  'Food & Dining',
  'Stay & Lodging',
  'Transport',
  'Activities',
  'Shopping',
  'Other',
] as const;

type CurrencyCode = (typeof VALID_CURRENCIES)[number];
type ExpenseCategory = (typeof VALID_CATEGORIES)[number];

interface ParsedReceiptPayload {
  merchantTitle: string;
  currency: CurrencyCode;
  date: string;
  category: ExpenseCategory;
  paidByName: string;
  items: Array<{
    name: string;
    quantity: number;
    totalPrice: number;
    suggestedMembers: string[];
  }>;
  tax: number;
  tip: number;
  discount: number;
  receiptTotal: number;
  notes: string;
}

function getGeminiClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    return null;
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

function sanitizeNumber(val: unknown): number {
  const n = typeof val === 'number' ? val : Number(val);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.round(n * 100) / 100;
}

function normalizeCurrency(val: unknown, fallback: CurrencyCode): CurrencyCode {
  if (typeof val === 'string') {
    const upper = val.trim().toUpperCase();
    if ((VALID_CURRENCIES as readonly string[]).includes(upper)) {
      return upper as CurrencyCode;
    }
  }
  return fallback;
}

function normalizeCategory(val: unknown): ExpenseCategory {
  if (typeof val === 'string') {
    const match = VALID_CATEGORIES.find(
      (c) => c.toLowerCase() === val.trim().toLowerCase()
    );
    if (match) return match;
  }
  return 'Food & Dining';
}

function normalizeDate(val: unknown): string {
  if (typeof val === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(val.trim())) {
    return val.trim();
  }
  return '';
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '1mb' }));

  app.post('/api/receipt/parse', async (req, res) => {
    try {
      const body = req.body as {
        rawText?: unknown;
        defaultCurrency?: unknown;
        memberNames?: unknown;
      };

      const rawText = typeof body?.rawText === 'string' ? body.rawText.trim() : '';
      if (!rawText) {
        res.status(400).json({
          error: 'Please paste a receipt or chat note to extract line items.',
        });
        return;
      }
      if (rawText.length > 15000) {
        res.status(400).json({
          error: 'Receipt text is too long (maximum 15,000 characters).',
        });
        return;
      }

      const defaultCurrency = normalizeCurrency(body?.defaultCurrency, 'USD');
      const memberNames = Array.isArray(body?.memberNames)
        ? body.memberNames.filter((n): n is string => typeof n === 'string' && n.trim().length > 0)
        : [];

      const ai = getGeminiClient();
      if (!ai) {
        res.status(503).json({
          error:
            'Gemini API key is not configured. Please add GEMINI_API_KEY in Settings > Secrets.',
        });
        return;
      }

      const memberContext =
        memberNames.length > 0
          ? `Trip group members: ${memberNames.join(', ')}.`
          : 'No preset member names provided.';

      const prompt = [
        'Extract all itemized charges, tax, tip/service charge, and any discounts from the following messy restaurant receipt or group chat note.',
        memberContext,
        `Default trip currency if none is explicitly shown: ${defaultCurrency}.`,
        'Rules:',
        '- Put every purchased dish, drink, or fee line item (excluding tax, tip, gratuity, service charge, subtotal, and grand total lines) in `items`.',
        '- Each item `totalPrice` must be the total price for that line (e.g. "2x Ramen 2400" -> quantity 2, totalPrice 2400).',
        '- Extract `tax` (GST/VAT/sales/consumption tax) and `tip` (tip/gratuity/service charge) separately as numbers (>= 0). Sum multiple tax lines into `tax` and tip/service lines into `tip`.',
        '- Extract `discount` as a positive number if a discount/coupon was subtracted.',
        '- Currency must be one of INR, USD, EUR, JPY (infer ¥/円 -> JPY, ₹/Rs/INR -> INR, € -> EUR, $ -> USD).',
        '- If the text mentions who had specific items (e.g. "Maya & Liam shared gyoza"), put matching names from the trip members list in `suggestedMembers` for that item; otherwise return an empty array [].',
        '- If the text states who paid the bill, set `paidByName` to the matching member name; otherwise empty string.',
        '- If a date is present, format it as YYYY-MM-DD; otherwise empty string.',
        '',
        'Receipt or chat note:',
        '"""',
        rawText,
        '"""',
      ].join('\n');

      const response = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: prompt,
        config: {
          systemInstruction:
            'You are a meticulous financial receipt parser. Extract accurate line items, taxes, tips, and currency without inventing prices.',
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              merchantTitle: {
                type: Type.STRING,
                description: 'Short merchant or meal title, e.g. Pontocho Izakaya Dinner.',
              },
              currency: {
                type: Type.STRING,
                description: 'One of INR, USD, EUR, JPY.',
              },
              date: {
                type: Type.STRING,
                description: 'Date in YYYY-MM-DD format if found, else empty string.',
              },
              category: {
                type: Type.STRING,
                description:
                  'One of Food & Dining, Stay & Lodging, Transport, Activities, Shopping, Other.',
              },
              paidByName: {
                type: Type.STRING,
                description: 'Name of person who paid if stated, else empty string.',
              },
              items: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    name: {
                      type: Type.STRING,
                      description: 'Item name without quantity prefix if possible.',
                    },
                    quantity: {
                      type: Type.NUMBER,
                      description: 'Quantity purchased (default 1).',
                    },
                    totalPrice: {
                      type: Type.NUMBER,
                      description: 'Total line price before tax and tip.',
                    },
                    suggestedMembers: {
                      type: Type.ARRAY,
                      items: { type: Type.STRING },
                      description: 'Matching member names if the note says who shared this item.',
                    },
                  },
                },
              },
              tax: {
                type: Type.NUMBER,
                description: 'Total tax amount (>= 0).',
              },
              tip: {
                type: Type.NUMBER,
                description: 'Total tip, gratuity, or service charge (>= 0).',
              },
              discount: {
                type: Type.NUMBER,
                description: 'Discount amount (>= 0).',
              },
              receiptTotal: {
                type: Type.NUMBER,
                description: 'Printed grand total if stated, else computed total.',
              },
              notes: {
                type: Type.STRING,
                description: 'Brief note about receipt details if relevant.',
              },
            },
          },
        },
      });

      const rawJson = (response.text ?? '{}').trim();
      let parsed: Record<string, unknown>;
      try {
        parsed = JSON.parse(rawJson) as Record<string, unknown>;
      } catch {
        res.status(502).json({
          error: 'Could not interpret the receipt format. Please try again or simplify the text.',
        });
        return;
      }

      const rawItems = Array.isArray(parsed.items) ? parsed.items : [];
      const items = rawItems
        .map((item) => {
          const obj = item as Record<string, unknown>;
          const name = typeof obj.name === 'string' ? obj.name.trim() : '';
          const totalPrice = sanitizeNumber(obj.totalPrice);
          const qtyRaw = Number(obj.quantity);
          const quantity = Number.isFinite(qtyRaw) && qtyRaw > 0 ? qtyRaw : 1;
          const suggestedMembers = Array.isArray(obj.suggestedMembers)
            ? obj.suggestedMembers.filter((s): s is string => typeof s === 'string')
            : [];
          return { name, quantity, totalPrice, suggestedMembers };
        })
        .filter((item) => item.name.length > 0 && item.totalPrice >= 0);

      const tax = sanitizeNumber(parsed.tax);
      const tip = sanitizeNumber(parsed.tip);
      const discount = sanitizeNumber(parsed.discount);
      const itemsSum = items.reduce((sum, it) => sum + it.totalPrice, 0);
      const computedTotal = Math.max(0, Math.round((itemsSum + tax + tip - discount) * 100) / 100);
      const printedTotal = sanitizeNumber(parsed.receiptTotal);

      const payload: ParsedReceiptPayload = {
        merchantTitle:
          typeof parsed.merchantTitle === 'string' && parsed.merchantTitle.trim()
            ? parsed.merchantTitle.trim()
            : 'Shared Receipt',
        currency: normalizeCurrency(parsed.currency, defaultCurrency),
        date: normalizeDate(parsed.date),
        category: normalizeCategory(parsed.category),
        paidByName: typeof parsed.paidByName === 'string' ? parsed.paidByName.trim() : '',
        items,
        tax,
        tip,
        discount,
        receiptTotal: printedTotal > 0 ? printedTotal : computedTotal,
        notes: typeof parsed.notes === 'string' ? parsed.notes.trim() : '',
      };

      res.json(payload);
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : 'Unexpected error parsing receipt.';
      const status =
        typeof (err as { status?: unknown })?.status === 'number'
          ? (err as { status: number }).status
          : 500;

      if (status === 403 || status === 400 && message.includes('API_KEY')) {
        res.status(status).json({
          error:
            'Gemini API key error. Please check your GEMINI_API_KEY in Settings > Secrets.',
        });
        return;
      }
      if (status === 429) {
        res.status(429).json({
          error: 'Rate limit reached while parsing receipt. Please wait a moment and try again.',
        });
        return;
      }

      res.status(500).json({
        error: `Failed to parse receipt with AI: ${message}`,
      });
    }
  });

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: process.env.DISABLE_HMR !== 'true',
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    if (fs.existsSync(distDir)) {
      app.use(express.static(distDir));
      app.get('*', (_req, res) => {
        res.sendFile(path.join(distDir, 'index.html'));
      });
    }
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`mindsplt server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
