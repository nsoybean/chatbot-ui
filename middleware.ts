export { auth as middleware } from './auth'

// page wished to be protected
export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)']
}
