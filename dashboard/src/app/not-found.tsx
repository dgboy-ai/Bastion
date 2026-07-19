import Link from "next/link";

export default function NotFound() {
  return (
    <div className="not-found">
      <div className="not-found-code">404</div>
      <h1 className="not-found-title">Page Not Found</h1>
      <p className="not-found-desc">
        The memory you&apos;re looking for doesn&apos;t exist in any timeline.
        It may have been superseded or never stored.
      </p>
      <Link href="/" className="btn btn-primary" style={{ padding: "12px 28px" }}>
        Return to Base
      </Link>
    </div>
  );
}
