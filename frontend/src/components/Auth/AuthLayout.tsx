import React from 'react';
import { Card } from '../ui/Card';

export interface AuthLayoutProps {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}

export const AuthLayout: React.FC<AuthLayoutProps> = ({
  title,
  subtitle,
  children,
}) => {
  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <Card elevation="md" padding="8">
          <div className="mb-8 text-center">
            <h1 className="text-3xl font-bold text-neutral-900 mb-2">
              {title}
            </h1>
            {subtitle && (
              <p className="text-base text-neutral-600">
                {subtitle}
              </p>
            )}
          </div>
          {children}
        </Card>
      </div>
    </div>
  );
};
