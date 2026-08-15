import { Suspense, lazy } from "react";
import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/components/theme-provider";
import NotFound from "@/pages/not-found";
import Home from "@/pages/home";

// The list is the entry point; the detail page carries the planner, the
// forecast and the report form. Loading it on demand keeps the first paint
// small, which matters because people open this on airport wifi.
const AirportDetail = lazy(() => import("@/pages/airport"));
const Privacy = lazy(() => import("@/pages/privacy"));

function RouteFallback() {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <span className="sr-only">Loading</span>
    </div>
  );
}

function Router() {
  return (
    <Suspense fallback={<RouteFallback />}>
      <Switch>
        <Route path="/" component={Home} />
        <Route path="/airport/:code" component={AirportDetail} />
        <Route path="/privacy" component={Privacy} />
        <Route component={NotFound} />
      </Switch>
    </Suspense>
  );
}

function App() {
  return (
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <Toaster />
          <Router />
        </TooltipProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
}

export default App;
