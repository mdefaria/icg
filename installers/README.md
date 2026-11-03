# installers/

Signed, notarised macOS `.pkg` and signed Windows `.exe` that install the Premiere CEP panel (`com.icg.premiere`) and the Resolve Workflow Integration plugin (`com.icg.resolve`), with per-Host component choice and an uninstaller. Status and open questions: `SPIKE.md`.

```
installers/
  common/sign-cep.sh          signed + timestamped ZXP -> extracted signed folder (both OSes)
  common/fetch-zxpsigncmd.sh  downloads Adobe's ZXPSignCmd into installers/tools/
  macos/build-pkg.sh          pkgbuild x3 -> productbuild -> productsign -> notarytool -> stapler
  macos/distribution.xml      choices (Premiere, Resolve), pre-selected by detected Hosts
  macos/scripts/*/postinstall ownership and permissions
  macos/uninstall.sh          shipped to /Library/Application Support/ICG/uninstall.sh
  windows/icg.iss             Inno Setup script: components, Host detection, SignTool hook
  windows/build.ps1           finds ISCC/signtool, wires Trusted Signing or a certificate, compiles
  fixtures/premiere/          minimal CEP panel to test the pipeline before apps/premiere exists
  build/, tools/              generated, gitignored
```

Install locations (sources in `SPIKE.md`):

| Host           | macOS                                                                                                         | Windows                                                                                                |
| -------------- | ------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Premiere (CEP) | `/Library/Application Support/Adobe/CEP/extensions/com.icg.premiere`                                          | `C:\Program Files (x86)\Common Files\Adobe\CEP\extensions\com.icg.premiere`                            |
| Resolve Studio | `/Library/Application Support/Blackmagic Design/DaVinci Resolve/Workflow Integration Plugins/com.icg.resolve` | `%PROGRAMDATA%\Blackmagic Design\DaVinci Resolve\Support\Workflow Integration Plugins\com.icg.resolve` |
| Uninstaller    | `/Library/Application Support/ICG/uninstall.sh`                                                               | Settings > Apps > ICG (Inno uninstaller in `C:\Program Files\ICG`)                                     |

## 1. Accounts and certificates

### CEP extension signature (both OSes, one certificate)

CEP refuses to load an extension from the extensions folder unless it carries a valid signature or `PlayerDebugMode` is set. Any certificate works, including a self-signed one made by `ZXPSignCmd -selfSignedCert`; what matters is that the signature is **timestamped**, otherwise the extension stops loading the day the certificate expires (Adobe's table in the [Package, Distribute, Install guide](https://github.com/Adobe-CEP/Getting-Started-guides/blob/master/Package%20Distribute%20Install/readme.md)).

Create once, keep in the password manager, store base64 in CI:

```sh
ZXPSignCmd -selfSignedCert GB London ICG "ICG" "<password>" icg-cep.p12 -validityDays 3650
base64 -i icg-cep.p12 | pbcopy      # -> secret CEP_SIGNING_CERT_P12
```

Cost: none. `ZXPSignCmd` is downloaded from [Adobe-CEP/CEP-Resources/ZXPSignCMD](https://github.com/Adobe-CEP/CEP-Resources/tree/master/ZXPSignCMD) (4.1.3 has `macOS`, `Win32`, `x64` folders; 4.1.103 is a Windows-only OpenSSL 1.1 rebuild). Put the direct download URL of the binary for each OS in the repository variables `ZXPSIGNCMD_URL_MACOS` / `ZXPSIGNCMD_URL_WINDOWS` (optionally `ZXPSIGNCMD_SHA256_*`).

### macOS

- **Apple Developer Program** membership (organisation or individual), USD 99/year. Only the Account Holder can create Developer ID certificates.
- **Developer ID Application** certificate: signs Mach-O binaries inside the payload (`WorkflowIntegration.node`, native node modules). Needed for notarisation to pass.
- **Developer ID Installer** certificate: signs the `.pkg` (`productsign`). Gatekeeper checks this one.
- **notarytool credentials**, one of:
  - App Store Connect API key (recommended for CI): Users and Access > Integrations > Team Keys, role Developer. Store the `.p8` base64 as `APP_STORE_CONNECT_KEY_P8`, plus `APP_STORE_CONNECT_KEY_ID` and `APP_STORE_CONNECT_ISSUER_ID`.
  - Apple ID + app-specific password (appleid.apple.com > Sign-In and Security > App-Specific Passwords) + Team ID, for local use via `xcrun notarytool store-credentials icg` and `NOTARY_KEYCHAIN_PROFILE=icg`.

Export both certificates from Keychain Access as `.p12` **with the private key and the Apple intermediate ("Developer ID Certification Authority")** so the chain resolves on a bare runner. Secrets: `APPLE_DEVELOPER_ID_APPLICATION_P12`, `APPLE_DEVELOPER_ID_INSTALLER_P12` (base64), `APPLE_CERTS_PASSWORD`, `KEYCHAIN_PASSWORD` (any random string), and the identity strings `APPLE_DEVELOPER_ID_APPLICATION` = `Developer ID Application: Name (TEAMID)`, `APPLE_DEVELOPER_ID_INSTALLER` = `Developer ID Installer: Name (TEAMID)`.

Apple's notarisation reference: [Customizing the notarization workflow](https://developer.apple.com/documentation/security/customizing-the-notarization-workflow) (`submit --wait`, `log`, `stapler staple`; flat `.pkg` is an accepted container and can be stapled; `altool` is gone since Nov 2023).

### Windows: code-signing options in 2026

Since 1 June 2023 the CA/Browser Forum requires OV and EV code-signing private keys to live on FIPS 140-2 Level 2 hardware (USB token or HSM), so a plain `.pfx` in a CI secret is no longer possible for CA-issued certificates. Options, cheapest first:

| Option                                                                   | Price (2026, as listed)                                                                                                                           | Fit for ICG                    | Notes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Azure Trusted Signing**, renamed **Artifact Signing** in 2026          | USD 9.99/month Basic (5,000 signatures, 1 of each certificate profile), USD 99.99/month Premium (100,000 signatures); overage USD 0.005/signature | Best if eligible               | Microsoft-run HSM, short-lived certificates renewed automatically, signs via `signtool /dlib` or `azure/artifact-signing-action@v2`. Organisations in the US, Canada, EU and UK (third-party lists in 2026 add AU, NZ, JP, KR, SG, CH, NO, IL); individuals US and Canada only. Microsoft's MSIX docs state organisations need **three years of verifiable tax history**; a Microsoft moderator has said there is no minimum age; reports conflict, so a young UK company must ask Azure Support before relying on it. Sources: [Microsoft, Code signing options](https://learn.microsoft.com/en-us/windows/apps/package-and-deploy/code-signing-options), [Q&A on eligibility](https://learn.microsoft.com/en-us/answers/questions/5977141/azure-artifact-signing-trusted-signing-is-a-us-llc), [azure/artifact-signing-action](https://github.com/Azure/trusted-signing-action), [SKU/pricing](https://learn.microsoft.com/en-us/azure/trusted-signing/how-to-change-sku). |
| **OV certificate + cloud signing** (SSL.com eSigner, DigiCert KeyLocker) | SSL.com OV USD 129/year list + eSigner USD 15/month; Sectigo OV via resellers USD 219 to 225/year; DigiCert OV USD 400 to 549/year                | Fallback if not eligible above | Key in the CA's HSM, signtool uses the CA's CSP/KSP; works in CI with API credentials. SmartScreen reputation builds with downloads. Sources: [SSL.com eSigner](https://www.ssl.com/products/software-integrity/signing-service/), [SSL Dragon 2026 comparison](https://www.ssldragon.com/blog/code-signing-certificate-providers/), [SSL2BUY DigiCert](https://www.ssl2buy.com/digicert-ov-code-signing-certificate.php).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| **OV certificate on a USB token**                                        | Certificate as above + token USD 120 to 249                                                                                                       | Local signing only             | Cannot sign on a hosted runner; the owner would sign the `.exe` locally after CI builds it unsigned (`build.ps1 -SignMode Thumbprint`).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| **EV certificate**                                                       | roughly USD 300 to 600/year plus token/HSM                                                                                                        | Not worth it                   | Historically gave instant SmartScreen reputation; since 2024 Microsoft is reported to no longer grant that automatically. Verify before paying the premium.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |

Recommendation: apply for Trusted Signing / Artifact Signing with the UK business; if refused (company age), buy SSL.com OV + eSigner. `build.ps1` supports both (`-SignMode TrustedSigning` or `-SignMode Thumbprint` with the eSigner CKA / KeyLocker KSP installed).

Secrets for Trusted Signing: `AZURE_TENANT_ID`, `AZURE_CLIENT_ID`, `AZURE_CLIENT_SECRET` (an app registration with the _Trusted Signing Certificate Profile Signer_ role), `AZURE_TRUSTED_SIGNING_ENDPOINT` (e.g. `https://weu.codesigning.azure.net`), `AZURE_TRUSTED_SIGNING_ACCOUNT`, `AZURE_TRUSTED_SIGNING_PROFILE`.

## 2. Running locally

Prerequisites: the apps built (`apps/premiere/dist`, `apps/resolve/dist`) or the fixture; `ZXPSignCmd` (`installers/common/fetch-zxpsigncmd.sh <url>` or `export ZXPSIGNCMD=/path/to/ZXPSignCmd`).

### Sign the CEP extension (any OS)

```sh
export CEP_SIGNING_CERT_PASSWORD=...
installers/common/sign-cep.sh --cert ~/secrets/icg-cep.p12            # real certificate
installers/common/sign-cep.sh --self-signed-dev                       # throwaway cert, dev only
installers/common/sign-cep.sh --src installers/fixtures/premiere --self-signed-dev   # fixture
```

Outputs `installers/build/cep/com.icg.premiere.zxp` and the extracted signed folder `installers/build/cep/com.icg.premiere/`. The script runs `ZXPSignCmd -verify` on both. On macOS add `--codesign-identity "Developer ID Application: ..."` if the panel contains native binaries (they must be codesigned before the ZXP is signed).

### macOS package

```sh
export APPLE_DEVELOPER_ID_APPLICATION="Developer ID Application: Name (TEAMID)"
export APPLE_DEVELOPER_ID_INSTALLER="Developer ID Installer: Name (TEAMID)"
export NOTARY_KEYCHAIN_PROFILE=icg      # after: xcrun notarytool store-credentials icg ...
installers/macos/build-pkg.sh --version 1.2.3
# unsigned dry run (Gatekeeper will block it; right-click > Open or `sudo installer -pkg ... -target /`):
installers/macos/build-pkg.sh --version 0.0.1 --skip-sign
```

Output `installers/build/macos/ICG-1.2.3.pkg`, plus the notarisation log next to it.

### Windows installer

```powershell
# Inno Setup 6.3+ (https://jrsoftware.org/isdl.php), Windows SDK (signtool), nuget.exe for Trusted Signing
.\installers\windows\build.ps1 -Version 1.2.3 -SignMode None
.\installers\windows\build.ps1 -Version 1.2.3 -SignMode TrustedSigning   # env AZURE_* set
.\installers\windows\build.ps1 -Version 1.2.3 -SignMode Thumbprint -CertThumbprint <sha1>
```

Output `installers\build\windows\ICG-1.2.3-win64.exe`.

### CI

`.github/workflows/release.yml` runs on tags `v*` (draft GitHub release with both installers and `SHA256SUMS.txt`) and on `workflow_dispatch` (set `skip_signing` to build unsigned installers without any secret).

## 3. Owner checklist (clean machines)

Use a clean user account or VM with Premiere Pro 23 or newer and DaVinci Resolve **Studio** 19 or newer installed, **no** `PlayerDebugMode` set, and the Hosts closed. Run it once with the fixture (before S1/S4 land) and again with the real apps.

### macOS

| #   | Step                                                                                                | Expected                                                                                                                                                                                 |
| --- | --------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `defaults read com.adobe.CSXS.11 PlayerDebugMode; defaults read com.adobe.CSXS.12 PlayerDebugMode`  | Both report "does not exist". If not, `defaults delete` them and `killall cfprefsd`.                                                                                                     |
| 2   | Download `ICG-x.y.z.pkg` with Safari (so it is quarantined) and double-click                        | Installer opens with no Gatekeeper warning. `spctl --assess --type install -vv ICG-x.y.z.pkg` prints `accepted` and `source=Notarized Developer ID`.                                     |
| 3   | Welcome, then Installation Type                                                                     | Premiere Pro panel and DaVinci Resolve Studio plugin shown; the ones installed on this Mac are pre-ticked. Untick one and continue, then re-run later with the other to test both paths. |
| 4   | Install                                                                                             | Asks for an admin password, finishes with the conclusion page.                                                                                                                           |
| 5   | `ls -la "/Library/Application Support/Adobe/CEP/extensions/com.icg.premiere"`                       | Folder owned `root:admin`, world-readable, contains `mimetype`, `META-INF/signatures.xml`, `CSXS/manifest.xml`.                                                                          |
| 6   | `ZXPSignCmd -verify "/Library/Application Support/Adobe/CEP/extensions/com.icg.premiere" -certinfo` | Verification succeeds, timestamp present.                                                                                                                                                |
| 7   | Launch Premiere Pro, Window > Extensions                                                            | "ICG" (or "ICG (installer fixture)") listed; opening it shows the panel content, not a blank panel. This confirms the signed folder loads **without PlayerDebugMode**.                   |
| 8   | Premiere > Preferences > ... nothing to change; also check `~/Library/Logs/CSXS/CEP*-PPRO.log`      | No "signature" or "invalid" errors for `com.icg.premiere`.                                                                                                                               |
| 9   | Launch DaVinci Resolve Studio, Workspace > Workflow Integrations                                    | "ICG" listed and opens. On Resolve Free the menu is absent (expected; not supported).                                                                                                    |
| 10  | `pkgutil --pkgs \| grep com.icg`                                                                    | `com.icg.premiere.pkg`, `com.icg.resolve.pkg`, `com.icg.common.pkg` (only the chosen Hosts).                                                                                             |
| 11  | Re-run the installer with a newer build                                                             | Upgrades in place; stale files from the old version are gone (check a file you removed).                                                                                                 |
| 12  | `sudo "/Library/Application Support/ICG/uninstall.sh"`                                              | Lists the folders, asks to confirm, removes them and the receipts; Hosts no longer show ICG after restart.                                                                               |

### Windows

| #   | Step                                                                                                           | Expected                                                                                                                                                                                                                                                           |
| --- | -------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | `reg query HKCU\Software\Adobe\CSXS.11 /v PlayerDebugMode` and `...CSXS.12...`                                 | "unable to find" for both.                                                                                                                                                                                                                                         |
| 2   | Download `ICG-x.y.z-win64.exe` with Edge and run it                                                            | SmartScreen may still show a reputation warning for the first downloads of a new certificate, but it must name the publisher. Properties > Digital Signatures shows one SHA-256 signature with a timestamp. `signtool verify /pa /v ICG-x.y.z-win64.exe` succeeds. |
| 3   | UAC prompt                                                                                                     | Publisher shown as the certificate subject, not "Unknown publisher".                                                                                                                                                                                               |
| 4   | Select Components page                                                                                         | Premiere Pro and DaVinci Resolve Studio components; detected Hosts pre-ticked; unticking both and pressing Next shows "Select at least one Host".                                                                                                                  |
| 5   | Ready page                                                                                                     | Lists the two destination folders.                                                                                                                                                                                                                                 |
| 6   | After install, `dir "C:\Program Files (x86)\Common Files\Adobe\CEP\extensions\com.icg.premiere"`               | `mimetype`, `META-INF\signatures.xml`, `CSXS\manifest.xml` present.                                                                                                                                                                                                |
| 7   | `ZXPSignCmd.exe -verify "C:\Program Files (x86)\Common Files\Adobe\CEP\extensions\com.icg.premiere" -certinfo` | Verification succeeds, timestamp present.                                                                                                                                                                                                                          |
| 8   | Launch Premiere Pro, Window > Extensions                                                                       | "ICG" listed and renders, no PlayerDebugMode. Check `%TEMP%\CEP*-PPRO.log` (or `%LOCALAPPDATA%\Temp`) for signature errors.                                                                                                                                        |
| 9   | Launch DaVinci Resolve Studio, Workspace > Workflow Integrations                                               | "ICG" listed and opens.                                                                                                                                                                                                                                            |
| 10  | Settings > Apps > Installed apps > ICG                                                                         | Version shown; publisher shown. Uninstall removes both folders (verify with `dir`) and the uninstaller is signed (Properties > Digital Signatures on `C:\Program Files\ICG\unins000.exe` before uninstalling).                                                     |
| 11  | Re-run installer over an existing install                                                                      | Components page remembers nothing surprising; upgrade replaces the folders wholesale.                                                                                                                                                                              |

### Negative test (proves the signature matters)

On either OS, after step 7/8 passes: delete `META-INF/signatures.xml` from the installed CEP folder, restart Premiere. Expected: ICG disappears from Window > Extensions. Restore the file (re-run the installer) and it comes back. If it does **not** disappear, CEP on that version is not validating folder signatures, which is worth knowing (then record it in `SPIKE.md`).
