import { LinkProvider } from "@astryxdesign/core/Link";
import { forwardRef, type ReactNode } from "react";
import { Link } from "react-router";

type RouterLinkProps = React.AnchorHTMLAttributes<HTMLAnchorElement> & {
  href: string;
};

const RouterLink = forwardRef<HTMLAnchorElement, RouterLinkProps>(
  function RouterLink({ href, ...props }, ref) {
    return <Link {...props} ref={ref} to={href} />;
  },
);

export function RouterLinkProvider({ children }: { children: ReactNode }) {
  return <LinkProvider component={RouterLink}>{children}</LinkProvider>;
}
