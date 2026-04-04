# Cloudflare Access: mTLS Setup Guide for iOS

To bypass the interactive Cloudflare Access login screen on your iPhone, you can use **Mutual TLS (mTLS)**. This allows Cloudflare to authenticate your device based on a client certificate installed on it.

## Prerequisites
- Access to your Cloudflare Zero Trust Dashboard.
- OpenSSL (optional, if you want to generate certs locally) or use Cloudflare's managed certificates.

## Step 1: Generate a Client Certificate
1. Log in to the **Cloudflare Zero Trust** dashboard.
2. Navigate to **Access** > **Service Auth** > **Mutual TLS**.
3. Click **Create Certificate**.
4. Select **Cloudflare Managed** (easiest) or upload your own CSR.
5. Set the **Common Name (CN)** to something descriptive (e.g., `iphone-pwa`).
6. Click **Save**.
7. **IMPORTANT**: Download the `.pem` and `.key` files (or the `.p12` if provided). You will need these to create a configuration profile for your iPhone.

## Step 2: Create a Configuration Profile (.mobileconfig)
iOS requires a configuration profile to install a client certificate for Safari/PWA usage.
1. You can use a tool like [Apple Configurator](https://apps.apple.com/us/app/apple-configurator/id1037126344) or a simple online `.mobileconfig` generator.
2. The profile should include the **Identity Certificate** (your `.p12` file).
3. If you only have `.pem` and `.key`, convert them to `.p12` first:
   ```bash
   openssl pkcs12 -export -out client.p12 -inkey client.key -in client.pem
   ```

## Step 3: Install on iPhone
1. Send the `.mobileconfig` or `.p12` file to your iPhone (AirDrop, iCloud, or Email).
2. Open **Settings** on your iPhone.
3. Tap **Profile Downloaded**.
4. Tap **Install** and follow the prompts.
5. Go to **Settings** > **General** > **About** > **Certificate Trust Settings** and ensure full trust is enabled for the root certificate if required.

## Step 4: Configure Cloudflare Access Policy
1. In Cloudflare Zero Trust, go to **Access** > **Applications**.
2. Find your application and click **Edit**.
3. Go to the **Policies** tab.
4. Click **Add a policy**.
5. Name it "mTLS Bypass".
6. **Action**: Select `Service Auth` or `Bypass`.
7. **Include**: 
   - Selector: `Valid Certificate`
   - Cert: Select the certificate you created in Step 1.
8. Click **Save**.

## Conclusion
Once installed and configured, your iPhone will automatically present the certificate when the PWA fetches data. Cloudflare will see the valid certificate and bypass the interactive login screen, even after your main session expires!
