import LanguageSelector from "@/components/ui/LanguageSelector";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
      <div className="max-w-md w-full space-y-8 p-8">
        <div className="flex justify-end">
          <LanguageSelector />
        </div>
        {children}
      </div>
    </div>
  );
}
