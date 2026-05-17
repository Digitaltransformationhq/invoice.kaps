import { LucideIcon } from 'lucide-react';

export function PlaceholderPage({
  title,
  description,
  icon: Icon
}: {
  title: string;
  description: string;
  icon: LucideIcon;
}) {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">{title}</h1>
        <p className="text-sm text-muted-foreground mt-1">{description}</p>
      </div>

      <div className="bg-white border border-border rounded-lg p-12">
        <div className="max-w-md mx-auto text-center">
          <div className="w-16 h-16 bg-accent/10 rounded-full flex items-center justify-center mx-auto mb-4">
            <Icon className="w-8 h-8 text-accent" />
          </div>
          <h3 className="text-lg font-semibold text-foreground mb-2">{title} Coming Soon</h3>
          <p className="text-sm text-muted-foreground">
            This feature is currently under development. Check back soon for updates.
          </p>
        </div>
      </div>
    </div>
  );
}
