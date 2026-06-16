import { useEffect } from "react";
import { useLocation } from "wouter";

export default function MyAccountRedirect() {
  const [, setLocation] = useLocation();
  useEffect(() => {
    setLocation("/account");
  }, [setLocation]);
  return null;
}
