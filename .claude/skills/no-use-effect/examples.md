# No useEffect — Code Examples

## Rule 1: Derive State, Don't Sync It

### Filtering a list

```typescript
// BAD: Two render cycles — first stale, then filtered
function ProductList() {
  const [products, setProducts] = useState([]);
  const [filteredProducts, setFilteredProducts] = useState([]);

  useEffect(() => {
    setFilteredProducts(products.filter((p) => p.inStock));
  }, [products]);
}

// GOOD: Compute inline in one render
function ProductList() {
  const [products, setProducts] = useState([]);
  const filteredProducts = products.filter((p) => p.inStock);
}
```

### Computed totals

```typescript
// BAD: total in deps can loop
function Cart({ subtotal }) {
  const [tax, setTax] = useState(0);
  const [total, setTotal] = useState(0);

  useEffect(() => {
    setTax(subtotal * 0.1);
  }, [subtotal]);

  useEffect(() => {
    setTotal(subtotal + tax);
  }, [subtotal, tax, total]);
}

// GOOD: No effects required
function Cart({ subtotal }) {
  const tax = subtotal * 0.1;
  const total = subtotal + tax;
}
```

### Expensive derived state

If the computation is expensive, use `useMemo` instead of `useEffect` + `setState`:

```typescript
// BAD: useEffect to cache expensive work
function SearchResults({ query, items }) {
  const [results, setResults] = useState([]);

  useEffect(() => {
    setResults(items.filter((item) => expensiveMatch(item, query)));
  }, [query, items]);
}

// GOOD: useMemo keeps it in one render pass
function SearchResults({ query, items }) {
  const results = useMemo(
    () => items.filter((item) => expensiveMatch(item, query)),
    [query, items],
  );
}
```

---

## Rule 2: Use Data-Fetching Libraries

### Basic fetch

```typescript
// BAD: Race condition risk, no cancellation
function ProductPage({ productId }) {
  const [product, setProduct] = useState(null);

  useEffect(() => {
    fetchProduct(productId).then(setProduct);
  }, [productId]);
}

// GOOD: Query library handles cancellation, caching, and staleness
function ProductPage({ productId }) {
  const { data: product } = useQuery(
    ['product', productId],
    () => fetchProduct(productId),
  );
}
```

### Dependent queries

```typescript
// BAD: Chained effects with intermediate state
function UserProfile({ userId }) {
  const [user, setUser] = useState(null);
  const [posts, setPosts] = useState([]);

  useEffect(() => {
    fetchUser(userId).then(setUser);
  }, [userId]);

  useEffect(() => {
    if (user) {
      fetchPosts(user.blogId).then(setPosts);
    }
  }, [user]);
}

// GOOD: Dependent queries expressed declaratively
function UserProfile({ userId }) {
  const { data: user } = useQuery(['user', userId], () => fetchUser(userId));
  const { data: posts } = useQuery(
    ['posts', user?.blogId],
    () => fetchPosts(user!.blogId),
    { enabled: !!user?.blogId },
  );
}
```

---

## Rule 3: Event Handlers, Not Effects

### User-triggered action

```typescript
// BAD: Effect as an action relay
function LikeButton() {
  const [liked, setLiked] = useState(false);

  useEffect(() => {
    if (liked) {
      postLike();
      setLiked(false);
    }
  }, [liked]);

  return <button onClick={() => setLiked(true)}>Like</button>;
}

// GOOD: Direct event-driven action
function LikeButton() {
  return <button onClick={() => postLike()}>Like</button>;
}
```

### Form submission

```typescript
// BAD: Flag-driven effect
function ContactForm() {
  const [formData, setFormData] = useState({});
  const [shouldSubmit, setShouldSubmit] = useState(false);

  useEffect(() => {
    if (shouldSubmit) {
      submitForm(formData);
      setShouldSubmit(false);
    }
  }, [shouldSubmit, formData]);

  return <form onSubmit={() => setShouldSubmit(true)}>...</form>;
}

// GOOD: Handle in the event
function ContactForm() {
  const [formData, setFormData] = useState({});

  const handleSubmit = () => {
    submitForm(formData);
  };

  return <form onSubmit={handleSubmit}>...</form>;
}
```

---

## Rule 4: useMountEffect for One-Time External Sync

### DOM focus

```typescript
function SearchInput() {
  const ref = useRef<HTMLInputElement>(null);

  useMountEffect(() => {
    ref.current?.focus();
  });

  return <input ref={ref} />;
}
```

### Third-party widget

```typescript
function MapContainer() {
  const ref = useRef<HTMLDivElement>(null);

  useMountEffect(() => {
    const map = new MapLibrary(ref.current!);
    return () => map.destroy();
  });

  return <div ref={ref} />;
}
```

### Conditional mounting (guard in the parent, not in the effect)

```typescript
// BAD: Guard inside effect
function VideoPlayer({ isLoading }) {
  useEffect(() => {
    if (!isLoading) playVideo();
  }, [isLoading]);
}

// GOOD: Mount only when preconditions are met
function VideoPlayerWrapper({ isLoading }) {
  if (isLoading) return <LoadingScreen />;
  return <VideoPlayer />;
}

function VideoPlayer() {
  useMountEffect(() => playVideo());
}
```

---

## Rule 5: Reset with Key, Not Dependency Choreography

### Video player that reloads on ID change

```typescript
// BAD: Effect attempts to emulate remount behavior
function VideoPlayer({ videoId }) {
  useEffect(() => {
    loadVideo(videoId);
  }, [videoId]);
}

// GOOD: key forces clean remount
function VideoPlayer({ videoId }) {
  useMountEffect(() => {
    loadVideo(videoId);
  });
}

function VideoPlayerWrapper({ videoId }) {
  return <VideoPlayer key={videoId} videoId={videoId} />;
}
```

### Chat thread that resets state per conversation

```typescript
// BAD: Manual reset when conversationId changes
function ChatThread({ conversationId }) {
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState('');

  useEffect(() => {
    setMessages([]);
    setDraft('');
    loadMessages(conversationId).then(setMessages);
  }, [conversationId]);
}

// GOOD: Key-based remount + data-fetching library
function ChatThreadWrapper({ conversationId }) {
  return <ChatThread key={conversationId} conversationId={conversationId} />;
}

function ChatThread({ conversationId }) {
  const { data: messages } = useQuery(
    ['messages', conversationId],
    () => loadMessages(conversationId),
  );
  const [draft, setDraft] = useState('');
}
```
