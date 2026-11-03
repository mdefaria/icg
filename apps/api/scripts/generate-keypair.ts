const pair = (await crypto.subtle.generateKey("Ed25519", true, [
  "sign",
  "verify",
])) as CryptoKeyPair;
const publicJwk = await crypto.subtle.exportKey("jwk", pair.publicKey);
const privateJwk = await crypto.subtle.exportKey("jwk", pair.privateKey);

console.log("SIGNING_PUBLIC_KEY_JWK  (wrangler.toml [vars], and embedded in the Hosts):");
console.log(JSON.stringify(publicJwk));
console.log("");
console.log(
  "SIGNING_PRIVATE_KEY_JWK (wrangler secret put SIGNING_PRIVATE_KEY_JWK; .dev.vars locally; never commit):",
);
console.log(JSON.stringify(privateJwk));

export {};
