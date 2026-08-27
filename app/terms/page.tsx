import type { Metadata } from "next";
import NavLogo from "@/components/NavLogo";
import Link from "next/link";
import Image from "next/image";

export const metadata: Metadata = {
  title: "Terms of Service — REBELIVE",
  description:
    "Terms and Conditions for rebelive.com, operated by Oxytrium Dynamics Private Limited.",
};

const MONO = "JetBrains Mono, Courier New, monospace";
const SANS = "Inter, -apple-system, sans-serif";

export default function TermsPage() {
  return (
    <>
      {/* Override the fixed/overflow-hidden body set in globals.css for this page */}
      <style>{`
        html, body {
          position: static !important;
          overflow: auto !important;
          height: auto !important;
          inset: auto !important;
          overscroll-behavior: auto !important;
        }
      `}</style>

      <div className="min-h-screen w-full" style={{ backgroundColor: "#f0efeb", fontFamily: SANS }}>
        {/* Nav */}
        <nav
          className="sticky top-0 z-10 flex items-center justify-between border-b border-black/10 px-6 py-4 sm:px-12"
          style={{ backgroundColor: "rgba(240,239,235,0.9)", backdropFilter: "blur(12px)" }}
        >
          <Link href="/" className="flex items-center gap-3 transition-opacity hover:opacity-70">
           <NavLogo tone={"light"} width={130} className="sm:!w-[180px]" />
          </Link>
          <span className="font-mono text-[9px] uppercase tracking-[0.25em] text-black/35" style={{ fontFamily: MONO }}>
            Legal
          </span>
        </nav>

        {/* Hero — centered */}
        <div className="border-b border-black/10 px-6 py-14 text-center sm:px-12 sm:py-20">
          <p className="font-mono text-[9px] uppercase tracking-[0.3em] text-black/40 mb-3" style={{ fontFamily: MONO }}>
            Oxytrium Dynamics Private Limited
          </p>
          <h1 className="text-4xl sm:text-5xl font-bold tracking-tight text-[#0a0a0a] leading-tight" style={{ fontFamily: SANS }}>
            Terms of Service
          </h1>
          <p className="mt-3 font-mono text-[10px] uppercase tracking-[0.2em] text-black/40" style={{ fontFamily: MONO }}>
            Effective Date: 10 January 2026
          </p>
        </div>

        {/* Content */}
        <div className="mx-auto max-w-3xl px-6 py-12 sm:px-12 sm:py-16 space-y-10">

          <p className="text-[15px] leading-relaxed text-black/70">
            Welcome to <strong>rebelive.com</strong> ("Site"), operated by{" "}
            <strong>Oxytrium Dynamics Private Limited</strong>, Ward No.12, Manikpur,
            Keshopur, Buxar, Rajpur, Bihar, India, 802113 ("Rebelive", "we", "our", or "us").
            These Terms of Service govern your use of our website and services. By accessing or
            using this Site, you agree to be bound by these Terms and our Privacy Policy.
            If you do not agree, please do not use our Site.
          </p>

          <Section title="Eligibility">
            <p>By using this Site, you confirm that you are at least 18 years old or accessing the Site under the supervision of a parent or legal guardian.</p>
          </Section>

          <Section title="1. Products and Services">
            <p>We offer food &amp; beverages and other related products for sale. All purchases are subject to availability. We reserve the right to modify or discontinue products at any time without notice. Prices are subject to change without notice. We make every effort to display accurate product information but do not guarantee the completeness, accuracy, or reliability of any content.</p>
          </Section>

          <Section title="2. Orders, Billing, and Subscriptions">
            <p>By placing an order, you agree to provide current, complete, and accurate purchase and account information. If you opt into a subscription or recurring service, you authorize us to charge your payment method at the designated intervals. You may cancel your subscription at any time through your account dashboard or by contacting us.</p>
          </Section>

          <Section title="3. Shipping and Returns">
            <p>Please refer to our Shipping &amp; Returns Policy for information on processing times, delivery methods, and return eligibility.</p>
          </Section>

          <Section title="4. Intellectual Property">
            <p>All content on this Site, including logos, images, graphics, text, product names, and designs, is the property of Rebelive or our licensors. You may not copy, modify, distribute, or use any part of this Site without prior written consent.</p>
          </Section>

          <Section title="5. User Conduct">
            <p>You agree not to:</p>
            <BulletList items={[
              "Use the Site for any unlawful purpose",
              "Attempt to gain unauthorized access to our systems",
              "Interfere with the security or integrity of the Site",
              "Post or transmit any harmful, defamatory, or infringing content",
            ]} />
          </Section>

          <Section title="6. Third-Party Links">
            <p>The Site may contain links to third-party websites that are not controlled by us. We are not responsible for their content, terms, or practices.</p>
          </Section>

          <Section title="7. Disclaimer of Warranties">
            <p>Your use of the Site is at your sole risk. The Site and all products are provided "as is" and "as available" without any warranties, express or implied, including merchantability, fitness for a particular purpose, and non-infringement. Individual results may vary. Our products are not intended to diagnose, treat, cure, or prevent any disease.</p>
          </Section>

          <Section title="8. Limitation of Liability">
            <p>To the fullest extent permitted by law, Rebelive shall not be liable for any indirect, incidental, special, or consequential damages arising from your use of the Site or products, including lost profits or data, even if we have been advised of the possibility of such damages.</p>
          </Section>

          <Section title="9. Indemnification">
            <p>You agree to indemnify and hold Rebelive harmless from any claims, losses, liabilities, or expenses (including legal fees) arising out of your use of the Site, violation of these Terms, or infringement of any third-party rights.</p>
          </Section>

          <Section title="10. Changes to These Terms">
            <p>We may update these Terms at any time. If we make material changes, we'll post the new Terms on this page with a revised effective date. Continued use of the Site after changes means you accept the updated Terms.</p>
          </Section>

          <Section title="11. Governing Law">
            <p>These Terms are governed by the laws of India, without regard to its conflict of laws principles.</p>
          </Section>

          <Section title="12. Contact Us">
            <p>Rebelive is a brand owned and operated by Oxytrium Dynamics Private Limited. If you have questions or concerns about these Terms, please contact us at:</p>
            <ContactBlock />
          </Section>
        </div>

        <Footer active="terms" />
      </div>
    </>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-3">
      <h2
        className="text-[11px] font-semibold uppercase tracking-[0.22em] text-black/40 border-b border-black/10 pb-2"
        style={{ fontFamily: MONO }}
      >
        {title}
      </h2>
      <div className="text-[14.5px] leading-relaxed text-black/75 space-y-2">{children}</div>
    </div>
  );
}

function BulletList({ items }: { items: string[] }) {
  return (
    <ul className="space-y-2 pl-4">
      {items.map((item) => (
        <li key={item} className="flex items-start gap-2.5 text-[14px] text-black/70">
          <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-black/30" />
          {item}
        </li>
      ))}
    </ul>
  );
}

function ContactBlock() {
  return (
    <div
      className="mt-3 rounded-xl border border-black/10 bg-black/[0.03] p-5 space-y-1 font-mono text-[11px] uppercase tracking-[0.15em] text-black/55"
      style={{ fontFamily: MONO }}
    >
      <p>Email:{" "}<a href="mailto:support@rebelive.com" className="text-black/80 hover:underline normal-case">support@rebelive.com</a></p>
      <p>Oxytrium Dynamics Private Limited</p>
      <p>Ward No.12, Manikpur, Keshopur</p>
      <p>Buxar, Rajpur, Bihar, India — 802113</p>
    </div>
  );
}

function Footer({ active }: { active: "terms" | "privacy" }) {
  return (
    <div className="border-t border-black/10 px-6 py-5 sm:px-12 flex flex-col sm:flex-row items-center justify-between gap-3"
      style={{ backgroundColor: "#f0efeb" }}>
      <p className="font-mono text-[8px] uppercase tracking-[0.2em] text-black/30" style={{ fontFamily: MONO }}>
        © Oxytrium Dynamics Private Limited
      </p>
      <p className="font-mono text-[9px] uppercase tracking-[0.3em] text-black/35" style={{ fontFamily: MONO }}>
        Wake · Fuel · Rebel
      </p>
      <div className="flex gap-4">
        <Link href="/privacy"
          className={`font-mono text-[8px] uppercase tracking-[0.18em] transition-colors hover:text-black/70 ${active === "privacy" ? "text-black/80" : "text-black/40"}`}
          style={{ fontFamily: MONO }}>
          Privacy Policy
        </Link>
        <Link href="/terms"
          className={`font-mono text-[8px] uppercase tracking-[0.18em] transition-colors hover:text-black/70 ${active === "terms" ? "text-black/80" : "text-black/40"}`}
          style={{ fontFamily: MONO }}>
          Terms of Service
        </Link>
      </div>
    </div>
  );
}
