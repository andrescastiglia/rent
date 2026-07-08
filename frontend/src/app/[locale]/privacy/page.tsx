import Link from "next/link";

export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-gray-50 dark:bg-gray-900 px-4 py-10 text-gray-900 dark:text-gray-100">
      <article className="mx-auto max-w-3xl rounded-lg border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-800">
        <Link
          href="/"
          className="mb-6 inline-block text-sm font-medium text-blue-600 hover:underline dark:text-blue-400"
        >
          Volver
        </Link>

        <h1 className="text-3xl font-bold">Privacy Policy</h1>
        <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
          Last Updated: July 7, 2026
        </p>

        <section className="mt-8 space-y-4">
          <p>
            This Privacy Policy describes how your personal information may be
            collected, used, and shared when you use the Real Estate Management
            System software (&quot;the Software&quot;). This policy reflects the
            nature of the Software as a development and demonstration project.
          </p>
        </section>

        <section className="mt-8 space-y-3">
          <h2 className="text-xl font-semibold">1. Information We Collect</h2>
          <p>When you use the Software, we may collect certain information:</p>
          <ul className="list-disc space-y-2 pl-6">
            <li>
              Personal Information: your name, email address, phone number, and
              any other details you provide during registration or use.
            </li>
            <li>
              Messaging Information: phone numbers, message content, delivery
              metadata, and signed document links needed to send operational
              WhatsApp notifications.
            </li>
            <li>
              Usage Data: information about how you interact with the Software,
              such as features used and pages visited.
            </li>
            <li>
              Technical Data: this may include your IP address, browser type,
              and operating system.
            </li>
          </ul>
        </section>

        <section className="mt-8 space-y-3">
          <h2 className="text-xl font-semibold">
            2. How We Use Your Information
          </h2>
          <p>The information we collect is used for these purposes:</p>
          <ul className="list-disc space-y-2 pl-6">
            <li>To provide, operate, and maintain the Software.</li>
            <li>
              To improve, personalize, and expand the Software&apos;s features
              and functionality.
            </li>
            <li>
              To understand and analyze usage patterns to aid in development.
            </li>
            <li>To communicate with you for support or updates.</li>
            <li>
              To send transactional real estate notifications, such as payment
              reminders, invoice notices, visit updates, and lease renewal
              alerts.
            </li>
          </ul>
        </section>

        <section className="mt-8 space-y-3">
          <h2 className="text-xl font-semibold">
            3. Information Sharing and Transparency
          </h2>
          <ul className="list-disc space-y-2 pl-6">
            <li>
              Lax Privacy Model: as this is a demonstration project, the data
              you enter is not guaranteed to be private. It may be visible to
              other users or administrators of the system.
            </li>
            <li>
              No Sale of Data: we do not, and will not, sell your personal
              information to third parties.
            </li>
            <li>
              Third-Party Services: when WhatsApp notifications are enabled,
              message data is sent to Meta&apos;s WhatsApp Business Platform
              only to deliver transactional messages requested or configured
              inside the Software. We do not share data with third-party
              services for advertising.
            </li>
          </ul>
        </section>

        <section className="mt-8 space-y-3">
          <h2 className="text-xl font-semibold">4. Data Deletion</h2>
          <p>
            You may request deletion of personal data associated with the
            Software by contacting the project owner at acastiglia@gmail.com.
            Include the email address or phone number associated with the
            account or contact record so the request can be located.
          </p>
          <p>
            Data deletion instructions are available at{" "}
            <Link
              href="/es/data-deletion"
              className="font-medium text-blue-600 hover:underline dark:text-blue-400"
            >
              https://rent.maese.com.ar/es/data-deletion
            </Link>
            .
          </p>
        </section>

        <section className="mt-8 space-y-3">
          <h2 className="text-xl font-semibold">5. Data Security</h2>
          <p>
            While we take reasonable steps to protect the data within the
            system, no electronic storage or transmission is 100% secure.
            Therefore, we cannot guarantee its absolute security. Do not upload
            sensitive personal information that you would not want to be
            exposed.
          </p>
        </section>

        <section className="mt-8 space-y-3">
          <h2 className="text-xl font-semibold">6. Changes to This Policy</h2>
          <p>
            We may update this privacy policy from time to time. Any changes
            will be posted on this page.
          </p>
        </section>

        <section className="mt-8 space-y-3">
          <h2 className="text-xl font-semibold">7. Contact Us</h2>
          <p>
            If you have any questions about this Privacy Policy, please contact
            the project owner at acastiglia@gmail.com.
          </p>
        </section>
      </article>
    </main>
  );
}
