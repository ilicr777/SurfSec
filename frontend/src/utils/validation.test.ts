import { expect, test, describe } from 'vitest'
import { validateDomains } from './validation'

describe('Domain Validation', () => {
  test('rejects empty input', () => {
    const result = validateDomains("   ");
    expect(result.valid).toBe(false);
    expect(result.error).toContain("Input cannot be empty");
  })

  test('validates correct domains', () => {
    const result = validateDomains("example.com, test.co.uk");
    expect(result.valid).toBe(true);
    expect(result.domains).toEqual(["example.com", "test.co.uk"]);
  })

  test('rejects invalid domain formats', () => {
    const result = validateDomains("example.com, invalid_domain, test.org");
    expect(result.valid).toBe(false);
    expect(result.error).toContain("invalid_domain");
  })
})
