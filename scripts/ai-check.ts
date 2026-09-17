/**
 * Does the configured model provider actually answer?
 *
 *   npm run ai:check
 *
 * One tiny structured call, and it prints the token counts the PROVIDER
 * reported rather than the ones we estimated. That matters: the cost model for
 * this product was built from a character-count heuristic, and Korean text
 * tokenises about three times denser than Latin — the only honest number is
 * the one that comes back on the response.
 *
 * Run this before a batch. A wrong model id, an unauthorised key or a schema
 * the provider rejects all fail here for a fraction of a cent, instead of
 * three thousand comments into a run.
 */
import { AiError, aiModel, aiProvider, generateStructured } from '@/lib/ai/provider';

interface Verdict {
  ok: boolean;
  language: string;
}

async function main() {
  console.log(`  provider ${aiProvider()} · model ${aiModel()}`);

  try {
    const { data, usage } = await generateStructured<Verdict>({
      system:
        'You label short texts. Answer only through the schema. `language` is the ISO 639-1 code of the text.',
      user: '이 영상 진짜 재밌게 봤어요',
      schema: {
        type: 'object',
        properties: {
          ok: { type: 'boolean', description: 'Always true.' },
          language: { type: 'string', description: 'ISO 639-1 code.' },
        },
        required: ['ok', 'language'],
      },
      toolName: 'record',
      maxTokens: 200,
    });

    console.log(`  answered   ${JSON.stringify(data)}`);
    console.log(`  tokens     ${usage.inputTokens} in · ${usage.outputTokens} out (reported, not estimated)`);
    if (data.language.toLowerCase().startsWith('ko')) {
      console.log('  Korean was read correctly.');
    } else {
      console.log(`  NOTE: expected a Korean label, got ${data.language}.`);
    }
  } catch (error) {
    if (error instanceof AiError) {
      console.error(`\n  FAILED (${error.provider}${error.status ? ` ${error.status}` : ''})`);
      console.error(`  ${error.message}`);
      if (error.status === 404) {
        console.error('\n  A 404 here is almost always the model id. Set ADFIT_AI_MODEL to an exact');
        console.error('  id from the provider\'s model list — the default in provider.ts is a family');
        console.error('  name on purpose, so it fails loudly rather than billing for something else.');
      }
      if (error.status === 401 || error.status === 403) {
        console.error('\n  The key was rejected. For Gemini this must be a Generative Language API');
        console.error('  key (AI Studio), not an OAuth access token and not a Cloud console key');
        console.error('  without that API enabled.');
      }
      process.exit(1);
    }
    throw error;
  }
}

main().catch((e) => {
  console.error(`\n  ${e instanceof Error ? e.message : e}`);
  process.exit(1);
});
