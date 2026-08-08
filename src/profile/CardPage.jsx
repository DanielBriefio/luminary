import { useEffect } from 'react';
import Spinner from '../components/Spinner';

export default function CardPage({ slug }) {
  // /c/:slug is the old card URL — redirect to the redesigned /p/:slug
  useEffect(() => {
    window.location.replace(`/p/${slug}`);
  }, [slug]);

  return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'100vh', fontFamily:"'DM Sans',sans-serif" }}>
      <Spinner/>
    </div>
  );
}
