import type { Metadata } from "next";
import Link from "next/link";
import { Contents, LegalHeader, Section } from "../parts";

export const metadata: Metadata = {
  title: "Terms of service — LifeOS",
  description:
    "The agreement between you and Cognify LLC for using LifeOS: what you can do, what we promise, and what happens when something goes wrong.",
};

const sections = [
  { id: "agreement", title: "The agreement" },
  { id: "what-lifeos-is", title: "What LifeOS is" },
  { id: "eligibility", title: "Who can use it" },
  { id: "account", title: "Your account and API keys" },
  { id: "mailboxes", title: "Your accounts, your authority" },
  { id: "ai-clients", title: "AI clients act as you" },
  { id: "acceptable-use", title: "Acceptable use" },
  { id: "providers", title: "Your providers’ rules still apply" },
  { id: "price", title: "What it costs" },
  { id: "availability", title: "Availability and changes" },
  { id: "your-content", title: "Your content stays yours" },
  { id: "our-ip", title: "Our software and our name" },
  { id: "termination", title: "Suspension and termination" },
  { id: "warranty", title: "No warranties" },
  { id: "liability", title: "Limitation of liability" },
  { id: "indemnity", title: "Indemnity" },
  { id: "law", title: "Governing law and disputes" },
  { id: "changes", title: "Changes to these terms" },
  { id: "misc", title: "The rest" },
  { id: "contact", title: "Contact us" },
];

export default function TermsOfService() {
  return (
    <article className="legal mx-auto max-w-3xl">
      <LegalHeader
        title="Terms of service"
        effective="25 August 2026"
        summary={[
          <>
            Connect accounts you actually own or are authorised to use, and don&rsquo;t use LifeOS
            to send spam or break the law.
          </>,
          <>
            <strong>Anything your AI client does through LifeOS counts as something you did</strong>{" "}
            — including sending, deleting, and trashing mail. Choose your clients carefully.
          </>,
          <>
            LifeOS is free today. If we introduce paid plans, we&rsquo;ll tell you before anything
            you use starts costing money.
          </>,
          <>
            The Service is provided as-is, our liability is capped, and Minnesota law governs any
            dispute.
          </>,
        ]}
      />

      <Contents sections={sections} />

      <Section id="agreement" n={1} title="The agreement">
        <p>
          These Terms are a contract between you and <strong>Cognify LLC</strong>, a Minnesota
          limited liability company (&ldquo;Cognify&rdquo;, &ldquo;we&rdquo;, &ldquo;us&rdquo;). They
          cover the LifeOS website at <strong>lifeos.you</strong>, the dashboard, the{" "}
          <code>lifeos</code> command-line app, the API, and the MCP endpoint — together, the{" "}
          <strong>Service</strong>.
        </p>
        <p>
          By creating an account or using the Service, you accept these Terms. If you are agreeing
          on behalf of a company, you confirm you have authority to bind it, and
          &ldquo;you&rdquo; means that company. If you don&rsquo;t accept these Terms, don&rsquo;t
          use LifeOS.
        </p>
        <p>
          The <Link href="/privacy">Privacy Policy</Link> is part of this agreement and explains
          what we do with your data.
        </p>
      </Section>

      <Section id="what-lifeos-is" n={2} title="What LifeOS is">
        <p>
          LifeOS connects the email and calendar accounts you own to AI clients that speak the
          Model Context Protocol. You link your accounts once, and LifeOS gives your client a single
          endpoint that can search, read, draft, send, label, archive, and trash mail across all of
          them, and — where the account grants it — list calendars, read events, create and change
          them, and respond to invitations.
        </p>
        <p>
          LifeOS is a conduit. It does not host your mailbox or your calendar, it is not your email
          or calendar provider, and it does not store your messages or your events. It carries
          requests to Google, Microsoft, and Apple and carries their answers back.
        </p>
      </Section>

      <Section id="eligibility" n={3} title="Who can use it">
        <p>
          You must be at least <strong>16 years old</strong> to use LifeOS. You must not be barred
          from using it under the laws of the United States or your own country, and you must not be
          on a US sanctions list or located in a jurisdiction subject to comprehensive US sanctions.
        </p>
      </Section>

      <Section id="account" n={4} title="Your account and API keys">
        <p>
          Keep your account details accurate, and keep access to your sign-in secure. API keys are
          bearer credentials: whoever holds one can do everything through the Service that you can.
        </p>
        <ul>
          <li>Treat keys like passwords. Don&rsquo;t commit them, paste them into shared chats, or hand them out.</li>
          <li>Create a separate key per client so you can revoke one without breaking the others.</li>
          <li>
            Revoke any key you think has leaked, immediately, from the dashboard or the CLI. Then
            tell us at <a href="mailto:mason@cognify.design">mason@cognify.design</a> if you think
            we should know.
          </li>
        </ul>
        <p>
          <strong>You are responsible for everything done with your account and your keys</strong>,
          whether or not you did it yourself.
        </p>
      </Section>

      <Section id="mailboxes" n={5} title="Your accounts, your authority">
        <p>
          You may only connect accounts you own or are authorised to access — mailboxes and
          calendars alike. If you connect a work account, you are confirming that your employer
          permits it and that you have any approval your organisation requires. If you lose that
          authority, disconnect the account.
        </p>
        <p>
          You can disconnect any account at any time from the dashboard or the CLI, and you can
          revoke our access at your provider independently. Doing either ends our ability to reach
          that account, on either surface.
        </p>
      </Section>

      <Section id="ai-clients" n={6} title="AI clients act as you">
        <p>
          When you connect an AI client to LifeOS, that client can take real, irreversible actions
          in your mailboxes and your calendars. It can send a message to a real person. It can
          archive, trash, or delete mail. It can create filters and set an auto-responder. It can
          put an event in your diary, email invitations to the guests, move a meeting, or cancel
          one.
        </p>
        <p>
          <strong>
            Instructions LifeOS receives from a client you authorised are treated as your
            instructions, and you are responsible for what results.
          </strong>{" "}
          AI models make mistakes and can be manipulated by content inside the messages they read.
          Connect only clients you trust, review actions that matter, and revoke access the moment a
          client no longer needs it.
        </p>
        <p>
          Third-party AI clients are not ours. What they do with the results LifeOS returns is
          governed by their terms and their privacy policies, and we are not responsible for them.
        </p>
      </Section>

      <Section id="acceptable-use" n={7} title="Acceptable use">
        <p>Don&rsquo;t use LifeOS to:</p>
        <ul>
          <li>
            send spam, bulk unsolicited email, phishing, or anything that would violate the CAN-SPAM
            Act, the GDPR&rsquo;s marketing rules, or equivalent law where your recipients are;
          </li>
          <li>impersonate anyone, or send mail from an address you are not entitled to use;</li>
          <li>break the law, infringe anyone&rsquo;s rights, or harass, threaten, or harm people;</li>
          <li>
            access mailboxes or calendars belonging to someone else without their informed
            permission, including monitoring another person&rsquo;s mail or whereabouts covertly;
          </li>
          <li>
            attack the Service or the infrastructure behind it — probing, scraping at volume,
            circumventing rate limits or authentication, or deliberately degrading it for others;
          </li>
          <li>
            resell, sublicense, or white-label the hosted Service as your own product without our
            written agreement;
          </li>
          <li>
            build a store of harvested mailbox data, or use LifeOS to train a model on other
            people&rsquo;s correspondence.
          </li>
        </ul>
        <p>
          We may apply rate limits and other technical controls to keep the Service healthy for
          everyone.
        </p>
      </Section>

      <Section id="providers" n={8} title="Your providers’ rules still apply">
        <p>
          Using LifeOS does not exempt you from the terms of Google, Microsoft, Apple, or whoever
          hosts your mail and your calendar. Their rules — including their acceptable-use, sending, and API policies —
          apply to everything done through LifeOS in your name. If a provider suspends or limits
          your account, the parts of LifeOS that depend on it will stop working, and that is between
          you and them.
        </p>
      </Section>

      <Section id="price" n={9} title="What it costs">
        <p>
          LifeOS is <strong>free today</strong>, and it will stay free for as long as we can carry
          the cost of running it.
        </p>
        <p>
          We may introduce paid plans, usage limits, or both. If we do, we will give you{" "}
          <strong>at least 30 days&rsquo; notice by email before any part of the Service you are
          already using starts costing money</strong>, and you will always have the choice to stop
          rather than pay. Any fees we do introduce will come with their own billing terms —
          charges, renewal, refunds, and taxes — and those will be added here before they apply to
          you. Free usage is offered as-is and may change with reasonable notice.
        </p>
      </Section>

      <Section id="availability" n={10} title="Availability and changes">
        <p>
          LifeOS is a young product. We do not offer a service level agreement, an uptime guarantee,
          or a promise that any particular feature will keep existing. We may change, add, or remove
          functionality, and we will give reasonable notice before removing something you depend on
          where we can.
        </p>
        <p>
          If we discontinue the Service entirely, we will give you at least{" "}
          <strong>30 days&rsquo; notice</strong> so you can disconnect your accounts and revoke
          credentials in good order.
        </p>
      </Section>

      <Section id="your-content" n={11} title="Your content stays yours">
        <p>
          Your email is yours. We claim no ownership of it and no licence to it beyond the narrow,
          technical permission needed to carry a request you made to your provider and carry the
          answer back to the client you authorised. That permission exists only for the duration of
          the request. We do not store your messages — see the{" "}
          <Link href="/privacy">Privacy Policy</Link>.
        </p>
        <p>
          If you send us feedback or suggestions, we may use them to improve LifeOS without
          obligation or payment to you. Nothing in this paragraph gives us rights to your mail.
        </p>
      </Section>

      <Section id="our-ip" n={12} title="Our software and our name">
        <p>
          The LifeOS source code is published under the MIT licence, and that licence — not this
          section — governs what you may do with the code itself.
        </p>
        <p>
          These Terms cover the <strong>hosted Service</strong> we run for you. The LifeOS and
          Cognify names, logos, and brand assets are ours; the MIT licence does not grant you rights
          to them, and you may not present a fork or deployment of your own as being LifeOS, or as
          endorsed by or affiliated with us.
        </p>
      </Section>

      <Section id="termination" n={13} title="Suspension and termination">
        <p>
          You can stop at any time: disconnect your accounts, revoke your keys, and ask us to
          delete your account at{" "}
          <a href="mailto:mason@cognify.design">mason@cognify.design</a>. Deletion works as described
          in the <Link href="/privacy">Privacy Policy</Link>.
        </p>
        <p>
          We may suspend or terminate your access if you breach these Terms, if your use puts the
          Service or other users at risk, or if we are required to by law or by one of our
          providers. Where the circumstances allow it, we will warn you first and give you a chance
          to put it right. If we terminate your account without cause, we will tell you and give you
          a reasonable window to disconnect cleanly.
        </p>
        <p>
          Sections 11 through 19 survive termination, along with anything else that by its nature
          should.
        </p>
      </Section>

      <Section id="warranty" n={14} title="No warranties">
        <p>
          <strong>
            The Service is provided &ldquo;as is&rdquo; and &ldquo;as available&rdquo;, without
            warranties of any kind, express or implied.
          </strong>{" "}
          To the fullest extent the law allows, we disclaim the implied warranties of
          merchantability, fitness for a particular purpose, title, and non-infringement.
        </p>
        <p>
          We do not warrant that the Service will be uninterrupted, timely, secure, or error-free;
          that results returned by a provider will be complete or accurate; or that actions taken by
          an AI client on your behalf will be the ones you intended. Some jurisdictions do not allow
          the exclusion of implied warranties, so parts of this section may not apply to you.
        </p>
      </Section>

      <Section id="liability" n={15} title="Limitation of liability">
        <p>
          To the fullest extent permitted by law, neither Cognify nor anyone working with us will be
          liable for indirect, incidental, special, consequential, exemplary, or punitive damages, or
          for lost profits, lost revenue, lost data, lost business, or the cost of substitute
          services — including where mail is sent, deleted, or altered by an AI client acting on
          your instruction — even if we were told such damages were possible.
        </p>
        <p>
          <strong>
            Our total liability arising out of or relating to the Service will not exceed the greater
            of (a) the amount you paid us for the Service in the twelve months before the claim, or
            (b) one hundred US dollars ($100).
          </strong>{" "}
          Since LifeOS is currently free, (b) is what applies.
        </p>
        <p>
          Nothing here limits liability that cannot be limited by law — including for fraud, or for
          death or personal injury caused by negligence. Some jurisdictions do not allow certain
          limitations, so parts of this section may not apply to you.
        </p>
      </Section>

      <Section id="indemnity" n={16} title="Indemnity">
        <p>
          You agree to indemnify and hold Cognify harmless from claims, damages, and reasonable legal
          costs brought by a third party arising from your use of the Service, your breach of these
          Terms, or your violation of anyone&rsquo;s rights — including claims arising from mail sent
          through your account. We will tell you promptly about any such claim and let you control
          the defence, provided any settlement releases us fully.
        </p>
      </Section>

      <Section id="law" n={17} title="Governing law and disputes">
        <p>
          These Terms are governed by the laws of the <strong>State of Minnesota</strong>, without
          regard to its conflict-of-laws rules. You and Cognify agree that any dispute will be
          brought exclusively in the state or federal courts located in{" "}
          <strong>Hennepin County, Minnesota</strong>, and we each consent to the personal
          jurisdiction of those courts.
        </p>
        <p>
          If you are a consumer resident in the EU, the UK, or another jurisdiction whose law gives
          you the right to bring proceedings in your local courts or to rely on mandatory local
          consumer protections, nothing here takes that away.
        </p>
        <p>
          Before filing anything, please email{" "}
          <a href="mailto:mason@cognify.design">mason@cognify.design</a>. Most problems are faster to
          fix than to litigate.
        </p>
      </Section>

      <Section id="changes" n={18} title="Changes to these terms">
        <p>
          We may update these Terms as LifeOS changes. The date at the top always reflects the
          current version. For material changes we will give notice by email or in the dashboard{" "}
          <strong>at least 30 days before they take effect</strong>. Continuing to use the Service
          after that date means you accept the new Terms; if you don&rsquo;t, close your account
          before then.
        </p>
      </Section>

      <Section id="misc" n={19} title="The rest">
        <ul>
          <li>
            <strong>Entire agreement.</strong> These Terms and the Privacy Policy are the whole
            agreement between us about the Service, and replace anything said earlier.
          </li>
          <li>
            <strong>Severability.</strong> If a provision is unenforceable, the rest stays in force
            and that provision is narrowed to the minimum extent needed.
          </li>
          <li>
            <strong>No waiver.</strong> Not enforcing something once doesn&rsquo;t mean we give up
            the right to enforce it later.
          </li>
          <li>
            <strong>Assignment.</strong> You may not assign these Terms without our written consent.
            We may assign them to an affiliate or an acquirer of our business.
          </li>
          <li>
            <strong>Force majeure.</strong> Neither of us is liable for failures caused by events
            outside reasonable control, including provider outages and infrastructure failures.
          </li>
          <li>
            <strong>Notices.</strong> We will contact you at your account email address. Contact us
            at <a href="mailto:mason@cognify.design">mason@cognify.design</a>.
          </li>
          <li>
            <strong>No agency.</strong> These Terms do not create a partnership, employment, or
            agency relationship between us.
          </li>
        </ul>
      </Section>

      <Section id="contact" n={20} title="Contact us">
        <p>
          Cognify LLC
          <br />
          Minnesota, United States
          <br />
          <a href="mailto:mason@cognify.design">mason@cognify.design</a>
        </p>
      </Section>
    </article>
  );
}
