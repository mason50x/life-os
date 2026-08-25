import type { Metadata } from "next";
import Link from "next/link";
import { Contents, LegalHeader, Section } from "../parts";

export const metadata: Metadata = {
  title: "Privacy policy — LifeOS",
  description:
    "What LifeOS stores, what it never stores, who it shares with, and how to get any of it deleted.",
};

const sections = [
  { id: "who-we-are", title: "Who we are" },
  { id: "pass-through", title: "Your email is not stored" },
  { id: "what-we-store", title: "What we do store" },
  { id: "cookies", title: "Cookies and tracking" },
  { id: "how-we-use", title: "How we use it" },
  { id: "google", title: "Google user data and Limited Use" },
  { id: "microsoft-apple", title: "Microsoft and Apple data" },
  { id: "ai-clients", title: "When your AI client reads your mail" },
  { id: "sharing", title: "Who else touches your data" },
  { id: "retention", title: "Keeping and deleting" },
  { id: "security", title: "Security" },
  { id: "rights", title: "Your rights" },
  { id: "california", title: "California privacy rights" },
  { id: "children", title: "Children" },
  { id: "changes", title: "Changes to this policy" },
  { id: "contact", title: "Contact us" },
];

export default function PrivacyPolicy() {
  return (
    <article className="legal mx-auto max-w-3xl">
      <LegalHeader
        title="Privacy policy"
        effective="25 August 2026"
        summary={[
          <>
            <strong>LifeOS never stores your email.</strong> Messages pass through us on their way
            to your AI client and are gone the moment the request finishes.
          </>,
          <>
            We store the minimum that makes a connection possible: who you are, which mailboxes you
            connected, and encrypted credentials to reach them.
          </>,
          <>
            We don&rsquo;t sell your data, run ads against it, or use it to train any AI model.
          </>,
          <>
            Disconnect a mailbox and its stored credentials are deleted immediately. Ask us to
            delete your account and everything goes.
          </>,
        ]}
      />

      <Contents sections={sections} />

      <Section id="who-we-are" n={1} title="Who we are">
        <p>
          LifeOS is built and operated by <strong>Cognify LLC</strong>, a Minnesota limited
          liability company (&ldquo;Cognify&rdquo;, &ldquo;we&rdquo;, &ldquo;us&rdquo;). This policy
          covers the LifeOS website at <strong>lifeos.you</strong>, the LifeOS dashboard, the{" "}
          <code>lifeos</code> command-line app, and the MCP endpoint your AI clients connect to.
          Together we call those the <strong>Service</strong>.
        </p>
        <p>
          For anything in this document — questions, requests, complaints — write to{" "}
          <a href="mailto:mason@cognify.design">mason@cognify.design</a>. A person reads it. For
          data-protection purposes, Cognify LLC is the controller of the personal data described
          here.
        </p>
      </Section>

      <Section id="pass-through" n={2} title="Your email is not stored">
        <p>
          LifeOS is a pass-through, and that is the whole design. When your AI client asks for
          something — search these threads, open this message, send this reply — the request goes
          live to Gmail, Microsoft Graph, or iCloud in that moment. The answer comes back through
          us and straight on to the client that asked.
        </p>
        <p>
          Along the way, message content and metadata exist only in server memory for as long as
          the request takes. We do not write them to our database, to a cache, to a search index,
          or to a log file. There is no archive of your mail on our side, because there is nothing
          to archive from.
        </p>
        <p>
          Practically, that means we cannot show you your own inbox history, we cannot recover a
          message you deleted, and we cannot hand your mail to anyone else — including under a
          subpoena — because we do not have it.
        </p>
      </Section>

      <Section id="what-we-store" n={3} title="What we do store">
        <p>
          A connection still needs a few records. Here is the entire list, which matches our
          database schema line for line.
        </p>

        <h3>Your LifeOS account</h3>
        <p>
          Your identifier at our sign-in provider, your email address, your first and last name and
          profile picture URL if your provider supplies them, when the account was created, and
          when we last saw you. This comes from signing in — we never ask you for a LifeOS password,
          and we never see one.
        </p>

        <h3>Connected mailboxes</h3>
        <p>
          For each inbox you connect: the provider (Gmail, Outlook, or iCloud), the email address,
          an optional display name, the sign-in address where it differs from the send-as address
          (iCloud custom domains), the connection status, when you connected it, and the
          credentials needed to reach it — OAuth access and refresh tokens, or, for iCloud, the
          app-specific password you generated. <strong>Credentials are encrypted with AES-256-GCM
          before they are stored</strong>, and the key that decrypts them is held in our
          application environment, not in the database.
        </p>

        <h3>API keys</h3>
        <p>
          The name you gave the key, a short prefix so you can tell keys apart in the dashboard, a
          SHA-256 hash of the key, and the created and last-used timestamps. The key itself is
          shown once, at creation, and never stored — if you lose it, no one can recover it, us
          included.
        </p>

        <h3>Things you send us</h3>
        <p>
          If you email support, we keep that correspondence so we can help you and remember the
          context next time.
        </p>

        <h3>Server logs</h3>
        <p>
          Our hosting provider records ordinary request metadata: IP address, timestamp, HTTP
          method, path, response status, and user agent. These logs exist to keep the Service up
          and to spot abuse. <strong>No message content or subject line is written to them.</strong>{" "}
          They are kept for a short operational window and then discarded.
        </p>
      </Section>

      <Section id="cookies" n={4} title="Cookies and tracking">
        <p>
          LifeOS sets one cookie: the encrypted session cookie our authentication provider uses to
          keep you signed in. Your light/dark theme preference is kept in your browser&rsquo;s local
          storage and never reaches us.
        </p>
        <p>
          That&rsquo;s it. <strong>No analytics, no advertising pixels, no session recording, no
          third-party trackers, no cross-site tracking of any kind.</strong> We don&rsquo;t operate a
          marketing list, so there is nothing to unsubscribe from beyond service notices. If that
          ever changes, this section changes with it, and we will say so before it takes effect.
        </p>
      </Section>

      <Section id="how-we-use" n={5} title="How we use it">
        <p>We use the data in section 3 to do four things:</p>
        <ul>
          <li>Sign you in and keep you signed in.</li>
          <li>Reach your mailboxes when you, or an AI client you authorised, asks us to.</li>
          <li>
            Keep the Service running and secure — debugging failures, enforcing rate limits,
            investigating abuse.
          </li>
          <li>
            Email you about the Service itself: a mailbox that needs reconnecting, a security
            notice, a material change to these documents.
          </li>
        </ul>
        <p>
          Under the UK and EU GDPR, our legal bases are: <strong>performance of a contract</strong>{" "}
          for the first two, <strong>legitimate interests</strong> in running a secure and reliable
          service for the third, and either <strong>legitimate interests</strong> or{" "}
          <strong>legal obligation</strong> for service and security notices. Where we ever rely on{" "}
          <strong>consent</strong>, we ask for it plainly and you can withdraw it at any time.
        </p>
        <p>
          We do not profile you, make automated decisions with legal effects about you, or enrich
          your record with data bought from anyone.
        </p>
      </Section>

      <Section id="google" n={6} title="Google user data and Limited Use">
        <p>
          <strong>
            LifeOS&rsquo;s use and transfer of information received from Google APIs to any other app
            will adhere to the{" "}
            <a
              href="https://developers.google.com/terms/api-services-user-data-policy"
              target="_blank"
              rel="noreferrer"
            >
              Google API Services User Data Policy
            </a>
            , including the Limited Use requirements.
          </strong>
        </p>

        <h3>The scopes we ask for, and why</h3>
        <ul>
          <li>
            <code>https://mail.google.com/</code> — full mailbox access. LifeOS exposes searching
            threads, reading messages, drafting, sending, labelling, archiving, and trashing as MCP
            tools, and this is the scope Gmail provides for that set of actions. It is requested
            once, when you connect a Google account.
          </li>
          <li>
            <code>gmail.settings.basic</code> — mailbox settings such as filters and the vacation
            responder, so those can be managed on your instruction rather than requiring a trip to
            Gmail.
          </li>
          <li>
            <code>openid</code>, <code>email</code>, <code>profile</code> — to identify you and to
            label the connected account with the right address in your dashboard.
          </li>
        </ul>

        <h3>What we do not do with Google user data</h3>
        <p>
          Google user data, which includes the content and metadata of your messages, is{" "}
          <strong>never</strong>:
        </p>
        <ul>
          <li>used for advertising of any kind, ours or anyone else&rsquo;s;</li>
          <li>
            sold, rented, or transferred to third parties, except to the service providers in
            section 9 who process it strictly on our behalf, or where we are legally compelled;
          </li>
          <li>
            used to train, fine-tune, evaluate, or improve any artificial-intelligence or
            machine-learning model, ours or anyone else&rsquo;s;
          </li>
          <li>
            read by a human. The only exceptions are the ones Google&rsquo;s policy allows: with your
            explicit consent (for example, when you ask us to look at a specific failure), where
            necessary for security purposes such as investigating abuse, or where the law requires
            it.
          </li>
        </ul>
        <p>
          You can review or revoke LifeOS&rsquo;s access to your Google account at any time at{" "}
          <a href="https://myaccount.google.com/permissions" target="_blank" rel="noreferrer">
            myaccount.google.com/permissions
          </a>
          .
        </p>
      </Section>

      <Section id="microsoft-apple" n={7} title="Microsoft and Apple data">
        <p>
          The commitments in section 6 are not Google-specific. They apply identically to mail we
          reach through Microsoft Graph and iCloud: not stored, not sold, not used for advertising,
          not used to train models, not read by us.
        </p>
        <p>
          For Outlook and Microsoft 365 accounts we request <code>Mail.ReadWrite</code>,{" "}
          <code>Mail.Send</code>, <code>MailboxSettings.ReadWrite</code>, <code>User.Read</code>, and{" "}
          <code>offline_access</code> — the same read, write, send, and settings surface described
          above, plus the refresh token that keeps the connection alive without asking you to sign
          in again. Revoke it at{" "}
          <a href="https://myapps.microsoft.com" target="_blank" rel="noreferrer">
            myapps.microsoft.com
          </a>
          .
        </p>
        <p>
          iCloud has no OAuth for mail, so LifeOS uses the app-specific password you generate. It is
          scoped to mail alone, encrypted before storage, and you can revoke it at{" "}
          <a href="https://account.apple.com" target="_blank" rel="noreferrer">
            account.apple.com
          </a>{" "}
          without touching the rest of your Apple account.
        </p>
      </Section>

      <Section id="ai-clients" n={8} title="When your AI client reads your mail">
        <p>
          This section matters more than any other, so it gets said plainly.
        </p>
        <p>
          LifeOS returns results to the MCP client you connected — Claude, ChatGPT, Cursor, your own
          script. <strong>The moment those results reach that client, they are in that
          company&rsquo;s hands, under that company&rsquo;s privacy policy, not ours.</strong> We
          cannot control what they retain, we cannot recall it, and we cannot promise anything on
          their behalf.
        </p>
        <p>
          Asking an assistant to read your inbox means sending those messages to that assistant.
          That is what you connected LifeOS to do. Read the privacy terms of the clients you
          connect, connect only ones you trust, and revoke access from the dashboard when a client
          no longer needs it.
        </p>
      </Section>

      <Section id="sharing" n={9} title="Who else touches your data">
        <p>
          We do not sell personal information. We do not share it for cross-context behavioural
          advertising. We do not hand it to data brokers. The complete list of processors who touch
          it on our behalf:
        </p>
        <ul>
          <li>
            <strong>WorkOS</strong> — sign-in, sessions, and the OAuth server your AI clients
            authenticate against. Sees your name and email address.
          </li>
          <li>
            <strong>Convex</strong> — our database. Holds the records in section 3. Credentials
            arrive there already encrypted.
          </li>
          <li>
            <strong>Vercel</strong> — hosting for the dashboard, the API, and the MCP endpoint.
            Requests pass through it in transit; nothing about your mail is persisted there by us.
          </li>
          <li>
            <strong>Google, Microsoft, and Apple</strong> — your mail providers, who hold the
            mailboxes we reach on your behalf.
          </li>
        </ul>
        <p>
          We may disclose information where we are legally required to, or where it is necessary to
          protect the rights, safety, or property of our users or of Cognify. If we are compelled to
          disclose data about you, we will tell you unless the law forbids it. If Cognify is ever
          acquired or merges with another company, your data may transfer as part of that
          transaction, and this policy will continue to apply until you are given notice of a new
          one.
        </p>
      </Section>

      <Section id="retention" n={10} title="Keeping and deleting">
        <p>
          Because we hold so little, deletion is quick and mostly in your hands.
        </p>
        <ul>
          <li>
            <strong>Disconnect a mailbox</strong> — from the dashboard or the <code>lifeos</code>{" "}
            CLI — and the record and its encrypted credentials are deleted from our database
            immediately. We recommend also revoking access at your provider (the links are in
            sections 6 and 7), which is the belt to our braces.
          </li>
          <li>
            <strong>Revoke an API key</strong> and its hash is deleted immediately. Any client using
            it stops working on the next request.
          </li>
          <li>
            <strong>Delete your account</strong> by writing to{" "}
            <a href="mailto:mason@cognify.design">mason@cognify.design</a> from your account
            address. We erase your user record, every connected mailbox, and every API key within{" "}
            <strong>30 days</strong>. Copies inside encrypted database backups age out within a
            further 30 days.
          </li>
          <li>
            <strong>Accounts left idle</strong> keep their records until you delete them or ask us
            to. We may delete accounts that have had no successful sign-in for 24 months, after
            emailing you first.
          </li>
          <li>
            <strong>Support email</strong> is kept for up to 24 months. Server logs are kept for a
            short operational window as described in section 3.
          </li>
        </ul>
      </Section>

      <Section id="security" n={11} title="Security">
        <ul>
          <li>
            OAuth tokens and iCloud app-specific passwords are encrypted with{" "}
            <strong>AES-256-GCM</strong> before they are written, and the encryption key lives in
            the application environment, separate from the database that holds the ciphertext.
          </li>
          <li>
            API keys are stored only as <strong>SHA-256 hashes</strong>. A stolen database row
            cannot be turned back into a working key.
          </li>
          <li>Every connection to and from LifeOS runs over TLS.</li>
          <li>
            Access to production systems is limited to the people who need it, protected by
            multi-factor authentication.
          </li>
          <li>
            Not storing your email is itself the strongest control we have. The breach that would
            hurt you most is the one we made impossible.
          </li>
        </ul>
        <p>
          No system is perfect. If we discover a breach affecting your personal data, we will notify
          you and any regulator we are required to notify without undue delay, and within 72 hours
          where the GDPR applies.
        </p>
      </Section>

      <Section id="rights" n={12} title="Your rights">
        <p>
          Wherever you live, you can ask us to show you what we hold, correct it, delete it, or send
          it to you in a portable format. Write to{" "}
          <a href="mailto:mason@cognify.design">mason@cognify.design</a> and we will respond within{" "}
          <strong>30 days</strong>. We will not charge you for it and we will not treat you
          differently for asking.
        </p>
        <p>
          If you are in the UK, the EU, or Switzerland, the GDPR gives you specific rights: access,
          rectification, erasure, restriction of processing, data portability, objection to
          processing based on legitimate interests, and withdrawal of consent where consent is what
          we relied on. You also have the right to complain to your national data protection
          authority, though we would be glad of the chance to fix it first.
        </p>
        <p>
          <strong>International transfers.</strong> Cognify is based in the United States and our
          infrastructure is operated there. If you use LifeOS from outside the US, your personal
          data is transferred to and processed in the US. Where that transfer needs a legal
          mechanism, we rely on the European Commission&rsquo;s Standard Contractual Clauses with
          the processors named in section 9.
        </p>
      </Section>

      <Section id="california" n={13} title="California privacy rights">
        <p>
          Under the CCPA as amended by the CPRA, in the past twelve months we have collected the
          categories of personal information listed in section 3: <strong>identifiers</strong> (name,
          email address, account identifiers, IP address), <strong>account credentials</strong>{" "}
          (encrypted mailbox tokens and hashed API keys), and{" "}
          <strong>internet or network activity</strong> limited to the server logs described there.
          We collect them for the purposes in section 5, from you and from the sign-in provider you
          chose, and we retain them as described in section 10.
        </p>
        <p>
          <strong>
            We have not sold personal information, and we have not shared it for cross-context
            behavioural advertising, in the preceding twelve months. We do not do either of those
            things at all.
          </strong>{" "}
          We also do not use or disclose sensitive personal information for purposes beyond those
          permitted without a right to limit. There is accordingly no &ldquo;Do Not Sell or Share My
          Personal Information&rdquo; link to offer you, because there is nothing to opt out of.
        </p>
        <p>
          California residents may request to know, delete, or correct their personal information,
          and may not be discriminated against for exercising those rights. An authorised agent can
          make a request for you if you give them written permission; we may need to verify the
          request with you directly. Use the same address:{" "}
          <a href="mailto:mason@cognify.design">mason@cognify.design</a>.
        </p>
      </Section>

      <Section id="children" n={14} title="Children">
        <p>
          LifeOS is not designed or intended for children. You must be at least{" "}
          <strong>16 years old</strong> to create an account, and we do not knowingly collect
          personal information from anyone under that age. If you believe a child has given us
          personal data, write to <a href="mailto:mason@cognify.design">mason@cognify.design</a> and
          we will delete it.
        </p>
      </Section>

      <Section id="changes" n={15} title="Changes to this policy">
        <p>
          We will update this policy when the product changes. The date at the top always reflects
          the current version. If a change materially affects how we handle your personal data — a
          new category of data, a new processor, a new purpose — we will tell you by email or in
          the dashboard <strong>before</strong> it takes effect, and continued use after that date
          means you accept the updated policy.
        </p>
      </Section>

      <Section id="contact" n={16} title="Contact us">
        <p>
          Cognify LLC
          <br />
          Minnesota, United States
          <br />
          <a href="mailto:mason@cognify.design">mason@cognify.design</a>
        </p>
        <p>
          Our postal address is available on request. See also the{" "}
          <Link href="/terms">Terms of Service</Link>, which govern your use of LifeOS.
        </p>
      </Section>
    </article>
  );
}
