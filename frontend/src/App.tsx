import { BrowserRouter } from "react-router";
import { Providers } from "./app/providers";
import { AppRoutes } from "./app/router";

export default function App() {
  return (
    <BrowserRouter>
      <Providers>
        <AppRoutes />
      </Providers>
    </BrowserRouter>
  );
}
