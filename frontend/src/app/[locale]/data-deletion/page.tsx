import Link from "next/link";

export default function DataDeletionPage() {
  return (
    <main className="min-h-screen bg-gray-50 dark:bg-gray-900 px-4 py-10 text-gray-900 dark:text-gray-100">
      <article className="mx-auto max-w-3xl rounded-lg border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-800">
        <Link
          href="/"
          className="mb-6 inline-block text-sm font-medium text-blue-600 hover:underline dark:text-blue-400"
        >
          Volver
        </Link>

        <h1 className="text-3xl font-bold">Data Deletion Instructions</h1>
        <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
          Last Updated: July 7, 2026
        </p>

        <section className="mt-8 space-y-4">
          <p>
            Rent does not use Facebook Login. If Meta requires a data deletion
            URL for this app, this page explains how users or contacts can
            request deletion of personal data processed by the Real Estate
            Management System.
          </p>
          <p>
            To request deletion, email acastiglia@gmail.com with the subject
            &quot;Rent data deletion request&quot; and include the email address
            or phone number associated with the account, tenant, owner,
            prospect, buyer, or WhatsApp contact record.
          </p>
          <p>
            After the request is verified, the project owner will delete or
            anonymize the associated personal information where technically and
            legally possible, including CRM contact records and WhatsApp message
            delivery data stored by Rent.
          </p>
        </section>

        <section className="mt-8 space-y-3">
          <h2 className="text-xl font-semibold">WhatsApp Data</h2>
          <p>
            Rent may process phone numbers, message bodies, delivery metadata,
            and signed document links to send transactional WhatsApp
            notifications through Meta&apos;s WhatsApp Business Platform. These
            messages are used for real estate operations such as payment
            reminders, invoice notices, visit follow-ups, and lease renewal
            alerts.
          </p>
        </section>

        <section className="mt-8 space-y-3">
          <h2 className="text-xl font-semibold">Contact</h2>
          <p>
            For privacy or deletion questions, contact acastiglia@gmail.com.
          </p>
        </section>
      </article>
    </main>
  );
}
