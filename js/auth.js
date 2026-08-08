import { supabase } from './supabaseClient.js';

export async function signUp(email, password) {
  return supabase.auth.signUp({ email, password });
}

export async function signIn(email, password) {
  return supabase.auth.signInWithPassword({ email, password });
}

export async function signOut() {
  await supabase.auth.signOut();
  window.location.href = 'index.html';
}

export async function getSession() {
  const { data } = await supabase.auth.getSession();
  return data.session;
}

// Redirects to index.html if nobody is logged in. Use at the top of trip.html.
export async function requireSession() {
  const session = await getSession();
  if (!session) {
    window.location.href = 'index.html';
    return null;
  }
  return session;
}
