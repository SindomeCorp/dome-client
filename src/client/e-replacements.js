// basic regex for any url
export const urlRegex = /(\b(https?|ftp|file):\/\/[-A-Z0-9+&@#\(\)\/%?=~_|!:,.;]*[-A-Z0-9+&\(\)@#\/%=~_|])/ig;

// regex that matches IPv4 and IPv6 addresses
const v4 = "(?:25[0-5]|2[0-4]\\d|1\\d\\d|[1-9]?\\d)(?:\\.(?:25[0-5]|2[0-4]\\d|1\\d\\d|[1-9]?\\d)){3}";
const v6segment = "[a-fA-F\\d]{1,4}";
const v6 = (
  `(?:${v6segment}:){7}(?:${v6segment}|:)|
  (?:${v6segment}:){6}(?:${v4}|:${v6segment}|:)|
  (?:${v6segment}:){5}(?::${v4}|(?::${v6segment}){1,2}|:)|
  (?:${v6segment}:){4}(?:(?::${v6segment}){0,1}:${v4}|(?::${v6segment}){1,3}|:)|
  (?:${v6segment}:){3}(?:(?::${v6segment}){0,2}:${v4}|(?::${v6segment}){1,4}|:)|
  (?:${v6segment}:){2}(?:(?::${v6segment}){0,3}:${v4}|(?::${v6segment}){1,5}|:)|
  (?:${v6segment}:){1}(?:(?::${v6segment}){0,4}:${v4}|(?::${v6segment}){1,6}|:)|
  (?::(?:(?::${v6segment}){0,5}:${v4}|(?::${v6segment}){1,7}|:))`
).replace(/\s+/g, "");

export const ipRegex = new RegExp(`(?:${v4})|(?:${v6})(?:%[0-9a-zA-Z]{1,})?`, "gi");

// Matches fully-qualified hostnames like foo.bar, a.b.c, ec2-1-2-3.region.compute.amazonaws.com
// - labels: [a-z0-9] then [a-z0-9-]{0,61} then [a-z0-9] (no leading/trailing hyphens)
// - TLD: letters 2–63 OR punycode xn--*
// - word boundaries around it; don't start right after @ or # (common in MOO text)
export const hostnameRegex = /(?<![@#])\b(?![^\s@]*@)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+(?:[a-z]{2,63}|xn--[a-z0-9-]{1,59})\b/gi;
