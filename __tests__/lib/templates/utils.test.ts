import {
  extractVariables,
  fillTemplate,
  getUnfilledVariables,
  isTemplateFilled,
  pickVariableValues,
  preparePrompt,
  resolvePrompt,
} from '@/lib/templates/utils';
import * as textUtils from '@/lib/text/utils';

describe('template utils', () => {
  it('extracts unique variables in order of appearance', () => {
    expect(extractVariables('{{B}} and {{A}} and {{B}} but not {{ bad }} or {single}')).toEqual(['B', 'A']);
    expect(extractVariables('')).toEqual([]);
  });

  it('fillTemplate replaces literally, without $-replacement patterns', () => {
    expect(fillTemplate('Price: {{PRICE}}', { PRICE: '$& $1 $$' })).toBe('Price: $& $1 $$');
    expect(fillTemplate('{{A}}{{A}} {{B}}', { A: 'x', B: '' })).toBe('xx ');
    // Only exact {{NAME}} is replaced, not prefixes or other names
    expect(fillTemplate('{{AB}} {{A}}', { A: '1' })).toBe('{{AB}} 1');
  });

  it('resolvePrompt keeps placeholders without a value', () => {
    expect(resolvePrompt('{{CONTEXT}} / {{TOPIC}} / {{EMPTY}}', { CONTEXT: 'Acme $1', EMPTY: '  ' })).toBe(
      'Acme $1 / {{TOPIC}} / {{EMPTY}}',
    );
  });

  it('reports unfilled variables', () => {
    expect(getUnfilledVariables('{{A}} {{B}} {{C}}', { A: 'x', B: ' ' })).toEqual(['B', 'C']);
    expect(isTemplateFilled('{{A}}', { A: 'x' })).toBe(true);
    expect(isTemplateFilled('{{A}}', {})).toBe(false);
  });

  it('picks only values used by the text', () => {
    expect(pickVariableValues('{{A}}', { A: '1', B: '2' })).toEqual({ A: '1' });
  });

  it('preparePrompt resolves or explains what is missing', () => {
    expect(preparePrompt('Hi {{NAME}}', { NAME: 'Kay' })).toEqual({ prompt: 'Hi Kay', error: null });
    expect(preparePrompt('{{A}} {{B}}', {}).error).toBe('Please fill in the placeholders {{A}}, {{B}}');
    expect(preparePrompt('{{A}}', { A: 'x'.repeat(20) }, 10).error).toMatch(/20 characters long \(maximum 10\)/);
  });

  it('lib/text/utils re-exports the shared implementation', () => {
    expect(textUtils.fillTemplate).toBe(fillTemplate);
    expect(textUtils.extractVariables).toBe(extractVariables);
  });
});
