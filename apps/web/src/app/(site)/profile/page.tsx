'use client';

import { useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { BadgeCheck, KeyRound, Loader2, MailWarning, UserRound } from 'lucide-react';
import { api, errorMessage } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ImageUploadField } from '@/components/image-upload-field';
import { Reveal } from '@/components/motion/reveal';
import { RequireAuth } from '@/components/guards';
import { useAuth } from '@/hooks/use-auth';

export default function ProfilePage() {
  return (
    <RequireAuth>
      <ProfileContent />
    </RequireAuth>
  );
}

function ProfileContent() {
  const { user, firebaseUser, refreshProfile, changePassword } = useAuth();

  const [fullName, setFullName] = useState(user?.fullName ?? '');
  const [phone, setPhone] = useState(user?.phone ?? '');
  const [profileImage, setProfileImage] = useState(user?.profileImage ?? '');
  const [savingProfile, setSavingProfile] = useState(false);

  const [newPassword, setNewPassword] = useState('');
  const [savingPassword, setSavingPassword] = useState(false);
  const isGoogle = firebaseUser?.providerData.some((p) => p.providerId === 'google.com');

  if (!user) return null;

  async function saveProfile(e: React.FormEvent) {
    e.preventDefault();
    setSavingProfile(true);
    try {
      const patch: Record<string, string> = {};
      if (fullName.trim() !== user!.fullName) patch.fullName = fullName.trim();
      if (phone.trim() !== (user!.phone ?? '')) patch.phone = phone.trim();
      if (profileImage.trim() !== (user!.profileImage ?? '')) patch.profileImage = profileImage.trim();
      if (Object.keys(patch).length === 0) {
        toast.info('Nothing to update');
        return;
      }
      await api.patch('/users/me', patch);
      await refreshProfile();
      toast.success('Profile updated');
    } catch (err) {
      toast.error('Update failed', { description: errorMessage(err) });
    } finally {
      setSavingProfile(false);
    }
  }

  async function savePassword(e: React.FormEvent) {
    e.preventDefault();
    if (newPassword.length < 6) {
      toast.error('Password too short', { description: 'Use at least 6 characters.' });
      return;
    }
    setSavingPassword(true);
    try {
      await changePassword(newPassword);
      setNewPassword('');
      toast.success('Password updated');
    } catch (err) {
      toast.error('Could not update password', {
        description: errorMessage(err),
      });
    } finally {
      setSavingPassword(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
      <Reveal>
        <h1 className="font-heading text-3xl font-bold tracking-tight sm:text-4xl">Profile settings</h1>
        <p className="mt-1 text-muted-foreground">Manage your account details.</p>
      </Reveal>

      <div className="mt-8 space-y-6">
        {/* Account identity (Firebase-owned) */}
        <Card className="card-lift">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <UserRound className="h-4 w-4" /> Account
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-4">
              <Avatar className="h-14 w-14 border-2 border-primary/15 ring-2 ring-primary/10 ring-offset-2 ring-offset-background transition-transform duration-300 hover:scale-105">
                <AvatarImage src={profileImage || user.profileImage || undefined} alt="" />
                <AvatarFallback className="bg-primary/10 font-bold text-primary">
                  {user.fullName.slice(0, 2).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0 text-sm">
                <p className="font-semibold">{user.fullName}</p>
                <p className="truncate text-muted-foreground">{user.email}</p>
                <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                  <Badge variant={user.emailVerified ? 'secondary' : 'outline'} className="gap-1">
                    {user.emailVerified ? (
                      <><BadgeCheck className="h-3 w-3" /> Email verified</>
                    ) : (
                      <><MailWarning className="h-3 w-3" /> Not verified</>
                    )}
                  </Badge>
                  {user.role === 'ADMIN' && <Badge className="bg-primary">Admin</Badge>}
                </div>
                {!user.emailVerified && (
                  <Button variant="link" size="sm" className="h-auto p-0 text-xs" asChild>
                    <Link href="/verify-email">Verify your email with a code</Link>
                  </Button>
                )}
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Email and sign-in method are managed by Firebase Authentication. To change your email,
              sign out and register the new address, or contact support.
            </p>
          </CardContent>
        </Card>

        {/* Profile fields (Neon-owned) */}
        <Card className="card-lift">
          <CardHeader>
            <CardTitle className="text-base">Profile details</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={saveProfile} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="fullName">Full name</Label>
                <Input id="fullName" value={fullName} onChange={(e) => setFullName(e.target.value)} minLength={2} maxLength={120} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="phone">Phone (Bangladesh)</Label>
                <Input id="phone" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+8801XXXXXXXXX" />
                <p className="text-xs text-muted-foreground">Used only for delivery coordination if a project needs it.</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="profileImage">Profile image</Label>
                <ImageUploadField
                  kind="avatar"
                  value={profileImage}
                  onChange={setProfileImage}
                  hint="Upload a photo from your device (PNG, JPEG or WebP, up to 2 MB), or paste a URL below."
                />
                <Input id="profileImage" type="url" value={profileImage} onChange={(e) => setProfileImage(e.target.value)} placeholder="https://…" />
              </div>
              <Button type="submit" disabled={savingProfile}>
                {savingProfile && <Loader2 className="h-4 w-4 animate-spin" />} Save changes
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* Password */}
        {!isGoogle && (
          <Card className="card-lift">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <KeyRound className="h-4 w-4" /> Password
              </CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={savePassword} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="newPassword">New password</Label>
                  <Input
                    id="newPassword"
                    type="password"
                    autoComplete="new-password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    minLength={6}
                    placeholder="At least 6 characters"
                  />
                </div>
                <Button type="submit" variant="outline" disabled={savingPassword || newPassword.length === 0}>
                  {savingPassword && <Loader2 className="h-4 w-4 animate-spin" />} Update password
                </Button>
              </form>
            </CardContent>
          </Card>
        )}
        {isGoogle && (
          <Card className="card-lift">
            <CardContent className="p-5 text-sm text-muted-foreground">
              You sign in with Google — password management is handled by your Google account.
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
