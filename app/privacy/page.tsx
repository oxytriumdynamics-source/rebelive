import type { Metadata } from "next";
import Link from "next/link";
import NavLogo from "@/components/NavLogo";
import SiteFooter from "@/components/SiteFooter";

export const metadata: Metadata = {
  title: "Privacy Policy — REBELIVE",
  description:
    "Privacy Policy for rebelive.com, operated by Oxytrium Dynamics Private Limited.",
};

const MONO = "JetBrains Mono, Courier New, monospace";
const SANS = "Inter, -apple-system, sans-serif";

export default function PrivacyPage() {
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
            Privacy Policy
          </h1>
          <p className="mt-3 font-mono text-[10px] uppercase tracking-[0.2em] text-black/40" style={{ fontFamily: MONO }}>
            Last Updated: 10 January 2026
          </p>
        </div>

        {/* Content */}
        <div className="mx-auto max-w-3xl px-6 py-12 sm:px-12 sm:py-16 space-y-10">

          <p className="text-[15px] leading-relaxed text-black/70">
            This Privacy Policy describes how <strong>Rebelive</strong> (the "Site", "we", "us", or "our") collects,
            uses, and discloses your personal information when you visit, use our services, or make a purchase from{" "}
            <strong>rebelive.com</strong>. Rebelive is a consumer wellness and functional beverage brand operated by{" "}
            <strong>Oxytrium Dynamics Pvt. Ltd.</strong> We value transparency and do not treat user data as a business model.
          </p>

          <Section title="Changes to This Privacy Policy">
            <p>We may update this Privacy Policy from time to time to reflect changes to our practices or for operational, legal, or regulatory reasons. We will post the revised policy on the Site with an updated "Last updated" date.</p>
          </Section>

          <Section title="How We Collect and Use Your Personal Information">
            <p>To provide the Services, we collect personal information from a variety of sources. We may use this information to communicate with you, provide or improve the Services, comply with legal obligations, enforce applicable terms, and protect our rights and users.</p>
          </Section>

          <Section title="What Personal Information We Collect">
            <SubHeading>Information You Provide Directly</SubHeading>
            <BulletList items={[
              "Contact details including your name, address, phone number, and email",
              "Order information including billing address, shipping address, payment confirmation, email, and phone number",
              "Account information including username, password, and security questions",
              "Customer support information you choose to include in communications with us",
            ]} />
            <SubHeading>Usage Data We Collect Automatically</SubHeading>
            <p>We may automatically collect information about your interaction with the Services using cookies, pixels, and similar technologies. This includes device information, browser information, network connection, IP address, and interaction data. This data is used in aggregated form to improve performance and experience.</p>
            <SubHeading>Information from Third Parties</SubHeading>
            <BulletList items={[
              "Companies who support our Site and Services",
              "Payment processors who collect payment information to process your orders",
              "Advertising and analytics partners who help us improve our services",
            ]} />
          </Section>

          <Section title="How We Use Your Personal Information">
            <BulletList items={[
              "Providing Products and Services — processing payments, fulfilling orders, managing your account, and arranging shipping and returns",
              "Marketing and Advertising — sending promotional communications and tailoring advertisements. We do not sell personal data for monetary consideration",
              "Security and Fraud Prevention — detecting and investigating possible fraudulent or malicious activity",
              "Communicating with You — providing customer support and improving our Services",
            ]} />
          </Section>

          <Section title="Cookies">
            <p>We use cookies to power and improve our Site and Services, run analytics, and better understand user interaction. Third-party service providers may also use cookies to tailor services and advertising. Most browsers accept cookies by default — you can disable them in your browser settings, though this may affect Site functionality.</p>
          </Section>

          <Section title="How We Disclose Personal Information">
            <p>We may disclose your personal information to:</p>
            <BulletList items={[
              "Vendors and third parties who perform services on our behalf (IT management, payment processing, data analytics, cloud storage, fulfillment)",
              "Business and marketing partners, who process data per their own privacy notices",
              "Affiliates or entities within our corporate group",
              "Parties involved in a business transaction (merger, acquisition, bankruptcy)",
              "Law enforcement or regulatory authorities when required by applicable law",
            ]} />
          </Section>

          <Section title="User Generated Content">
            <p>If you submit product reviews or other content to public areas of the Services, this content will be publicly accessible. We are not responsible for the privacy or security of any information you make publicly available.</p>
          </Section>

          <Section title="Third Party Websites and Links">
            <p>Our Site may link to third-party platforms not controlled by us. We are not responsible for their privacy or security practices. Please review their policies independently.</p>
          </Section>

          <Section title="Children's Data">
            <p>The Services are not intended for children. We do not knowingly collect personal information from children. If you believe a child has provided us with their data, please contact us for deletion. We do not knowingly sell or share personal information of individuals under 16.</p>
          </Section>

          <Section title="Security and Retention">
            <p>No security measures are perfect or impenetrable. We recommend not using insecure channels to communicate sensitive information. We retain your personal information as long as needed to maintain your account, provide Services, comply with legal obligations, and resolve disputes.</p>
          </Section>

          <Section title="Your Rights">
            <p>Depending on where you live, you may have the following rights regarding your personal information:</p>
            <BulletList items={[
              "Right to Access / Know — request access to personal information we hold about you",
              "Right to Delete — request deletion of personal information we maintain about you",
              "Right to Correct — request correction of inaccurate personal information",
              "Right of Portability — receive a copy of your personal information in a portable format",
              "Restriction of Processing — ask us to stop or restrict processing of your personal information",
              "Withdrawal of Consent — withdraw consent where we rely on it to process your data",
              "Appeal — appeal our decision if we decline to process your request",
              "Managing Communication Preferences — opt out of promotional emails via the unsubscribe link",
            ]} />
            <p className="text-[13.5px] text-black/60 pt-1">You may exercise these rights by contacting us at the details below. We will not discriminate against you for exercising your rights.</p>
          </Section>

          <Section title="Compliance with Indian Data Protection Laws">
            <p>We comply with applicable Indian data protection laws, including the <strong>Digital Personal Data Protection Act, 2023</strong>. Users may contact us to raise concerns or request information related to their personal data.</p>
          </Section>

          <Section title="International Users">
            <p>We may transfer, store, and process your personal information outside the country you live in. Where we transfer personal information out of Europe, we rely on recognized mechanisms such as the European Commission's Standard Contractual Clauses or equivalent contracts.</p>
          </Section>

          <Section title="Contact">
            <p>Should you have any questions about our privacy practices or this Privacy Policy, or if you would like to exercise any of your rights, please contact us:</p>
            <div
              className="mt-3 rounded-xl border border-black/10 bg-black/[0.03] p-5 space-y-1 font-mono text-[11px] uppercase tracking-[0.15em] text-black/55"
              style={{ fontFamily: MONO }}
            >
              <p>Email:{" "}<a href="mailto:support@rebelive.com" className="text-black/80 hover:underline normal-case">support@rebelive.com</a></p>
              <p>Oxytrium Dynamics Pvt. Ltd.</p>
              <p>Ward No.12, Manikpur, Keshopur</p>
              <p>Buxar, Rajpur, Bihar, India — 802113</p>
            </div>
          </Section>
        </div>

        <SiteFooter />
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
      <div className="text-[14.5px] leading-relaxed text-black/75 space-y-3">{children}</div>
    </div>
  );
}

function SubHeading({ children }: { children: React.ReactNode }) {
  return (
    <p className="font-semibold text-[13px] text-black/55 mt-4 mb-1" style={{ fontFamily: SANS }}>
      {children}
    </p>
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

