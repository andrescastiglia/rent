import Link from "next/link";

export default function TermsPage() {
  return (
    <main className="min-h-screen bg-gray-50 dark:bg-gray-900 px-4 py-10 text-gray-900 dark:text-gray-100">
      <article className="mx-auto max-w-3xl rounded-lg border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-800">
        <Link
          href="/"
          className="mb-6 inline-block text-sm font-medium text-blue-600 hover:underline dark:text-blue-400"
        >
          Volver
        </Link>

        <h1 className="text-3xl font-bold">Terms of Service</h1>
        <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
          Last Updated: December 2, 2025
        </p>

        <section className="mt-8 space-y-4">
          <p>
            Welcome to the Real Estate Management System software (&quot;the
            Software&quot;). These terms and conditions outline the rules and
            regulations for the use of the Software.
          </p>
          <p>
            By accessing and using the Software, you accept these terms and
            conditions in full. Do not continue to use the Software if you do
            not accept all of the terms and conditions stated on this page.
          </p>
        </section>

        <section className="mt-8 space-y-3">
          <h2 className="text-xl font-semibold">1. License to Use</h2>
          <ul className="list-disc space-y-2 pl-6">
            <li>
              Unless otherwise stated, the owner of the project (&quot;the
              Owner&quot;) owns the intellectual property rights for all
              material in the Software.
            </li>
            <li>
              You are granted a limited, non-exclusive, non-transferable license
              to use the Software for personal and commercial purposes, subject
              to the restrictions provided in these terms.
            </li>
          </ul>
        </section>

        <section className="mt-8 space-y-3">
          <h2 className="text-xl font-semibold">2. Restrictions</h2>
          <p>You are expressly restricted from all of the following:</p>
          <ul className="list-disc space-y-2 pl-6">
            <li>
              Selling, sublicensing, or commercializing Software material.
            </li>
            <li>
              Using the Software in any way that is, or may be, damaging to the
              Software or its availability.
            </li>
            <li>
              Using the Software contrary to applicable laws and regulations, or
              in a way that causes, or may cause, harm to the Software, or to
              any person or business entity.
            </li>
          </ul>
        </section>

        <section className="mt-8 space-y-3">
          <h2 className="text-xl font-semibold">3. No Warranties</h2>
          <p>
            The Software is provided &quot;as is,&quot; with all faults, and the
            Owner makes no express or implied representations or warranties of
            any kind related to the Software or the materials contained within
            it. Nothing in the Software shall be construed as providing consult
            or advice to you.
          </p>
        </section>

        <section className="mt-8 space-y-3">
          <h2 className="text-xl font-semibold">4. Limitation of Liability</h2>
          <p>
            In no event shall the Owner, nor any of its officers, directors, and
            employees, be liable to you for anything arising out of or in any
            way connected with your use of the Software, whether such liability
            is under contract, tort, or otherwise. The Owner shall not be liable
            for any indirect, consequential, or special liability arising out of
            or in any way related to your use of the Software.
          </p>
        </section>

        <section className="mt-8 space-y-3">
          <h2 className="text-xl font-semibold">
            5. Governing Law and Jurisdiction
          </h2>
          <p>
            These Terms will be governed by and construed in accordance with the
            laws of the jurisdiction where the Owner resides, and you submit to
            the non-exclusive jurisdiction of the state and federal courts
            located in that jurisdiction for the resolution of any disputes.
          </p>
        </section>
      </article>
    </main>
  );
}
