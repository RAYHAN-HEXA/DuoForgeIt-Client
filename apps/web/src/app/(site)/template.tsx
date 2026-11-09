/**
 * Re-mounts on navigation, giving every site route a soft entrance without
 * touching any page component or its data flow.
 */
export default function SiteTemplate({ children }: { children: React.ReactNode }) {
  return <div className="page-enter flex flex-1 flex-col">{children}</div>;
}
