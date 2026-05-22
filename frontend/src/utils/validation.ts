export function validateDomains(input: string): { valid: boolean; domains: string[]; error?: string } {
  if (!input || !input.trim()) {
    return { valid: false, domains: [], error: "Input cannot be empty" };
  }
  
  const domainList = input.split(",").map(d => d.trim()).filter(Boolean);
  
  if (domainList.length === 0) {
    return { valid: false, domains: [], error: "No valid domains provided" };
  }
  
  // Basic domain format regex
  const domainRegex = /^[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
  const invalidDomains = domainList.filter(d => !domainRegex.test(d));
  
  if (invalidDomains.length > 0) {
    return { valid: false, domains: [], error: `Invalid domain formats: ${invalidDomains.join(", ")}` };
  }
  
  return { valid: true, domains: domainList };
}
