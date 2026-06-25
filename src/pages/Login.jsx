import { useState } from 'react';
import { supabase } from '../supabaseClient';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [isSignUp, setIsSignUp] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleAuth = async (e) => {
    e.preventDefault();
    setLoading(true);

    if (isSignUp) {
      // Sign Up configuration
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { full_name: fullName } // This triggers the profiles table auto-insert we wrote in Step 1
        }
      });
      if (error) alert(error.message);
      else alert('Registration successful! Please sign in.');
      setIsSignUp(false);
    } else {
      // Sign In configuration
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) alert(error.message);
    }
    setLoading(false);
  };

  return (
    <div style={{ maxWidth: '400px', margin: '100px auto', padding: '20px', border: '1px solid #ccc', borderRadius: '8px' }}>
      <h2>{isSignUp ? 'Create Org Account' : 'Organization Sign In'}</h2>
      <form onSubmit={handleAuth}>
        {isSignUp && (
          <div style={{ marginBottom: '15px' }}>
            <label>Full Name:</label>
            <input type="text" value={fullName} onChange={(e) => setFullName(e.target.value)} required style={{ width: '100%', padding: '8px', marginTop: '5px' }} />
          </div>
        )}
        <div style={{ marginBottom: '15px' }}>
          <label>Email:</label>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required style={{ width: '100%', padding: '8px', marginTop: '5px' }} />
        </div>
        <div style={{ marginBottom: '15px' }}>
          <label>Password:</label>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required style={{ width: '100%', padding: '8px', marginTop: '5px' }} />
        </div>
        <button type="submit" disabled={loading} style={{ width: '100%', padding: '10px', backgroundColor: '#0070f3', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>
          {loading ? 'Processing...' : isSignUp ? 'Register' : 'Sign In'}
        </button>
      </form>
      <p style={{ marginTop: '20px', textAlign: 'center', cursor: 'pointer', color: '#0070f3' }} onClick={() => setIsSignUp(!isSignUp)}>
        {isSignUp ? 'Already have an account? Sign In' : "Don't have an account? Register"}
      </p>
    </div>
  );
}