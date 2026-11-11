import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert, FlatList, Image, KeyboardAvoidingView, Modal, Platform, Pressable,
  SafeAreaView, ScrollView, StyleSheet, Text, TextInput, View
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ImagePicker from 'expo-image-picker';

const STORAGE_KEY = 'bookMap.state.v1';
const TYPES = [
  ['idea','💡','Myśl'],
  ['remember','🔥','Zapamiętać'],
  ['reflection','🧠','Przemyślenie'],
  ['apply','✅','Zastosuję'],
  ['question','❓','Pytanie'],
  ['photo','📸','Zdjęcie strony'],
];
const TYPE_MAP = Object.fromEntries(TYPES.map(([key,emoji,label]) => [key,{key,emoji,label}]));

const C = {
  bg:'#0B0A08', panel:'#15130F', panel2:'#1C1913', line:'#312B20',
  text:'#F2EDDF', muted:'#A99F8D', gold:'#D7B56D', green:'#7FB184', red:'#D87070'
};

const uid = p => `${p}_${Date.now()}_${Math.random().toString(36).slice(2,8)}`;
const dateLabel = ts => new Date(ts).toLocaleDateString('pl-PL',{day:'2-digit',month:'short',year:'numeric'});
const todayKey = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
};
const weekKey = () => {
  const d = new Date();
  const day = d.getDay() || 7;
  d.setHours(0,0,0,0);
  d.setDate(d.getDate() - day + 1);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
};
const dailyIndex = len => {
  if (!len) return 0;
  const k = todayKey();
  let h = 0;
  for (let i=0;i<k.length;i++) h = ((h<<5)-h)+k.charCodeAt(i);
  return Math.abs(h)%len;
};
const emptyMemory = () => ({sentences:['','',''],meaning:'',action:'',updatedAt:null});
const getMemory = book => {
  const m = book?.memory || {};
  return {
    sentences:[...(m.sentences || []),'','',''].slice(0,3),
    meaning:m.meaning || '',
    action:m.action || '',
    updatedAt:m.updatedAt || null,
    lastRecallAt:m.lastRecallAt || null,
    lastRecallText:m.lastRecallText || ''
  };
};
const getFullSummary = book => typeof book?.fullSummary === 'string' ? book.fullSummary : '';
const summaryWordCount = value => (String(value||'').trim().match(/\S+/g) || []).length;

// Szkic nie jest streszczeniem generowanym przez AI: tylko układa własne notatki
// i pozostawia miejsce na dopisanie treści całej książki.
const buildSummaryDraft = book => {
  const memory = getMemory(book);
  const notes = [...(book.notes || [])]
    .filter(n => n.type !== 'photo' && (n.text || '').trim())
    .sort((a,b) => Number(!!b.starred) - Number(!!a.starred));
  const ideas = [];
  const already = new Set();
  const addIdea = value => {
    const text = String(value || '').trim();
    if (!text) return;
    const key = text.toLocaleLowerCase('pl-PL');
    if (already.has(key)) return;
    already.add(key);
    ideas.push(text);
  };
  memory.sentences.forEach(addIdea);
  notes.filter(n => ['remember','idea','reflection'].includes(n.type))
    .forEach(n => { if (ideas.length < 12) addIdea(n.text); });
  const applications = [];
  if (memory.action.trim()) applications.push(memory.action.trim());
  notes.filter(n => n.type === 'apply').slice(0,5).forEach(n => {
    if (!applications.includes(n.text.trim())) applications.push(n.text.trim());
  });

  return [
    `PODSUMOWANIE: ${book.title}`,
    book.author ? `Autor: ${book.author}` : '',
    '',
    'O CZYM JEST TA KSIĄŻKA?',
    '[Opisz własnymi słowami temat i przebieg całej książki.]',
    '',
    'GŁÓWNE TEMATY I NAJWAŻNIEJSZE IDEE',
    ideas.length ? ideas.map((x,i)=>`${i+1}. ${x}`).join('\n') : '[Wpisz główne tematy i ważne idee.]',
    '',
    'CO ZROZUMIAŁEM Z TEJ KSIĄŻKI?',
    memory.meaning.trim() || '[Własne wnioski i przemyślenia.]',
    '',
    'CO ZAMIERZAM WYKORZYSTAĆ?',
    applications.length ? applications.map(x=>`• ${x}`).join('\n') : '[Jedna lub kilka rzeczy do zastosowania.]',
    '',
    'PODSUMOWANIE WŁASNYMI SŁOWAMI',
    '[Napisz, jak opowiedziałbyś komuś o tej książce od początku do końca.]'
  ].filter((line,index,all)=>line || (index>0 && all[index-1]!=='' )).join('\n');
};
const memorySentenceCount = book => getMemory(book).sentences.filter(x => x.trim()).length;
const memoryComplete = book => {
  const m = getMemory(book);
  return m.sentences.every(x=>x.trim()) && m.meaning.trim() && m.action.trim();
};


const ADVISOR_STOP = new Set([
  'i','a','ale','albo','bo','by','byc','być','co','czy','do','dla','gdy','gdzie','go','ja','jak','jest','juz','już','kiedy',
  'mi','mnie','na','nad','nie','o','od','po','pod','przez','sie','się','to','tu','w','we','z','za','ze','że','mam','moge','mogę',
  'chce','chcę','bardzo','teraz','dzis','dziś','ten','ta','te','tego','tej','tym','swoj','swój','swoja','swoją','moj','mój','moja'
]);
const ADVISOR_TOPICS = [
  ['skupienie','skupic','skupić','koncentracja','koncentrowac','koncentrować','deep','gleboka','głęboka','praca','rozproszenie','rozpraszanie'],
  ['telefon','smartfon','scroll','scrollowanie','instagram','youtube','social','media','powiadomienia','bodzce','bodźce'],
  ['dyscyplina','regularnosc','regularność','konsekwencja','nawyk','nawyki','rutyna','system'],
  ['motywacja','motywacji','energia','checi','chęci','prokrastynacja','odkladanie','odkładanie'],
  ['strach','lek','lęk','obawa','stres','presja','emocje','emocja','nerwy'],
  ['trading','trade','rynek','setup','wejscie','wejście','stop','loss','risk','ryzyko','rr'],
  ['decyzja','decyzje','wybor','wybór','wybierac','wybierać','problem','rozwiazanie','rozwiązanie'],
  ['czas','plan','planowanie','priorytet','priorytety','zadanie','zadania','termin'],
  ['sen','spac','spać','zmeczenie','zmęczenie','odpoczynek','regeneracja']
];
const normalizeAdvisor = value => String(value||'')
  .toLowerCase()
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g,'')
  .replace(/[^a-z0-9\s-]/g,' ')
  .replace(/\s+/g,' ')
  .trim();
const advisorTokens = value => normalizeAdvisor(value)
  .split(' ')
  .map(x=>x.trim())
  .filter(x=>x.length>2 && !ADVISOR_STOP.has(x));
const expandAdvisorTokens = tokens => {
  const set = new Set(tokens);
  ADVISOR_TOPICS.forEach(group => {
    const normGroup = group.map(normalizeAdvisor);
    if (normGroup.some(x=>set.has(x))) normGroup.forEach(x=>set.add(x));
  });
  return [...set];
};
const advisorSourcesForBook = book => {
  const out=[];
  (book.notes||[]).forEach(note=>{
    if ((note.text||'').trim() && note.type!=='photo') out.push({
      id:`note_${book.id}_${note.id}`,bookId:book.id,bookTitle:book.title,
      label:TYPE_MAP[note.type]?.label||'Notatka',type:note.type,kind:'note',
      text:note.text.trim(),page:note.page||''
    });
  });
  const m=getMemory(book);
  m.sentences.forEach((text,index)=>{
    if ((text||'').trim()) out.push({
      id:`memory_${book.id}_${index}`,bookId:book.id,bookTitle:book.title,
      label:`Najważniejsza idea ${index+1}`,type:'remember',kind:'memory',text:text.trim(),page:''
    });
  });
  if (m.meaning.trim()) out.push({
    id:`meaning_${book.id}`,bookId:book.id,bookTitle:book.title,label:'Twoimi słowami',
    type:'reflection',kind:'meaning',text:m.meaning.trim(),page:''
  });
  if (m.action.trim()) out.push({
    id:`action_${book.id}`,bookId:book.id,bookTitle:book.title,label:'Co chciałeś zrobić inaczej',
    type:'apply',kind:'action',text:m.action.trim(),page:''
  });
  return out;
};
const findAdvisorMatches = (books,scope,query) => {
  const qNorm=normalizeAdvisor(query);
  const qRaw=advisorTokens(query);
  const qTokens=expandAdvisorTokens(qRaw);
  if (!qRaw.length) return [];
  const pool=(books||[])
    .filter(b=>scope==='all'||b.id===scope)
    .flatMap(advisorSourcesForBook);
  return pool.map(item=>{
    const textNorm=normalizeAdvisor(`${item.label} ${item.text}`);
    const textTokens=new Set(advisorTokens(textNorm));
    let score=0;
    qTokens.forEach(t=>{
      if (textTokens.has(t)) score+=3;
      else if (textNorm.includes(t)) score+=1.4;
    });
    qRaw.forEach(t=>{ if (textNorm.includes(t)) score+=2; });
    if (qNorm.length>5 && textNorm.includes(qNorm)) score+=8;
    if (item.type==='apply'||item.kind==='action') score+=0.75;
    if (item.kind==='memory') score+=0.35;
    return {...item,score};
  }).filter(x=>x.score>0).sort((a,b)=>b.score-a.score).slice(0,4);
};

function Header({title,subtitle,onBack,right}) {
  return (
    <View style={s.header}>
      <View style={s.headerLeft}>
        {onBack ? <Pressable style={s.back} onPress={onBack}><Text style={s.backText}>‹</Text></Pressable> : null}
        <View style={{flex:1}}>
          <Text style={s.kicker}>{subtitle}</Text>
          <Text style={s.title}>{title}</Text>
        </View>
      </View>
      {right || null}
    </View>
  );
}

function Button({label,onPress,secondary,danger,small,disabled}) {
  return (
    <Pressable disabled={disabled} onPress={onPress} style={[
      s.btn, secondary && s.btnSecondary, danger && s.btnDanger, small && s.btnSmall, disabled && s.btnDisabled
    ]}>
      <Text style={[
        s.btnText, secondary && s.btnTextSecondary, danger && s.btnTextDanger, disabled && s.btnTextDisabled
      ]}>{label}</Text>
    </Pressable>
  );
}

function Empty({title,body,action,onPress}) {
  return (
    <View style={s.empty}>
      <Text style={s.emptyTitle}>{title}</Text>
      <Text style={s.emptyBody}>{body}</Text>
      {onPress ? <Button label={action} onPress={onPress}/> : null}
    </View>
  );
}

function NoteCard({note,onDelete,onToggleBookmark,bookTitle,onOpenBook}) {
  const m = TYPE_MAP[note.type] || TYPE_MAP.idea;
  return (
    <Pressable onLongPress={onDelete} delayLongPress={550} style={s.noteCard}>
      <View style={s.noteTop}>
        <View style={{flex:1}}>
          <Text style={s.noteType}>{m.emoji} {m.label}</Text>
          {bookTitle ? <Text style={s.bookmarkBook}>{bookTitle}</Text> : null}
        </View>
        <View style={s.noteTopRight}>
          <Text style={s.noteDate}>{dateLabel(note.createdAt)}</Text>
          {onToggleBookmark ? (
            <Pressable
              onPress={(e)=>{e?.stopPropagation?.();onToggleBookmark();}}
              hitSlop={10}
              style={[s.bookmarkButton,note.starred&&s.bookmarkButtonActive]}
            >
              <Text style={[s.bookmarkIcon,note.starred&&s.bookmarkIconActive]}>{note.starred?'★':'☆'}</Text>
            </Pressable>
          ) : null}
        </View>
      </View>
      {note.image ? <Image source={{uri:note.image}} style={s.noteImage}/> : null}
      {note.text ? <Text style={s.noteText}>{note.text}</Text> : null}
      {note.page ? <Text style={s.notePage}>str. {note.page}</Text> : null}
      {onOpenBook ? (
        <Pressable onPress={(e)=>{e?.stopPropagation?.();onOpenBook();}} style={s.bookmarkOpen}>
          <Text style={s.bookmarkOpenText}>OTWÓRZ KSIĄŻKĘ →</Text>
        </Pressable>
      ) : null}
    </Pressable>
  );
}

export default function App() {
  const [data,setData] = useState({books:[],weeklyFocus:null});
  const [loaded,setLoaded] = useState(false);
  const [tab,setTab] = useState('books');
  const [selectedId,setSelectedId] = useState(null);
  const [bookModal,setBookModal] = useState(false);
  const [noteModal,setNoteModal] = useState(false);
  const [memoryModal,setMemoryModal] = useState(false);
  const [recallModal,setRecallModal] = useState(false);
  const [summaryModal,setSummaryModal] = useState(false);
  const [summaryEditing,setSummaryEditing] = useState(false);
  const [summaryDraft,setSummaryDraft] = useState('');

  const [bookTitle,setBookTitle] = useState('');
  const [bookAuthor,setBookAuthor] = useState('');
  const [bookCover,setBookCover] = useState(null);

  const [noteType,setNoteType] = useState('idea');
  const [noteText,setNoteText] = useState('');
  const [notePage,setNotePage] = useState('');
  const [noteImage,setNoteImage] = useState(null);

  const [memorySentences,setMemorySentences] = useState(['','','']);
  const [memoryMeaning,setMemoryMeaning] = useState('');
  const [memoryAction,setMemoryAction] = useState('');

  const [recallText,setRecallText] = useState('');
  const [recallReveal,setRecallReveal] = useState(false);
  const [advisorQuery,setAdvisorQuery] = useState('');
  const [advisorScope,setAdvisorScope] = useState('all');
  const [advisorResults,setAdvisorResults] = useState([]);
  const [advisorAction,setAdvisorAction] = useState('');
  const [advisorSearched,setAdvisorSearched] = useState(false);

  useEffect(() => {
    (async()=>{
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        if (raw) {
          const parsed = JSON.parse(raw);
          setData({books:Array.isArray(parsed.books)?parsed.books:[],weeklyFocus:parsed.weeklyFocus||null});
        }
      } catch(e) { console.log(e); }
      setLoaded(true);
    })();
  },[]);

  useEffect(() => {
    if (loaded) AsyncStorage.setItem(STORAGE_KEY,JSON.stringify(data)).catch(console.log);
  },[data,loaded]);

  const selected = useMemo(
    () => data.books.find(b=>b.id===selectedId) || null,
    [data.books,selectedId]
  );

  const allNotes = useMemo(() => {
    const out=[];
    data.books.forEach(b => (b.notes||[]).forEach(n => out.push({...n,bookId:b.id,bookTitle:b.title})));
    return out.sort((a,b)=>b.createdAt-a.createdAt);
  },[data.books]);

  const bookmarkedNotes = useMemo(
    () => allNotes.filter(n=>n.starred),
    [allNotes]
  );

  const daily = useMemo(() => {
    const pool = allNotes.filter(n=>n.type!=='photo' && (n.text||'').trim());
    return pool.length ? pool[dailyIndex(pool.length)] : null;
  },[allNotes]);

  const activeWeekly = useMemo(() => {
    const w = data.weeklyFocus;
    return w && w.weekKey===weekKey() ? w : null;
  },[data.weeklyFocus]);

  async function chooseImage(setter) {
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing:true,
      quality:0.72,
      base64:true
    });
    if (!res.canceled && res.assets?.[0]?.base64) {
      const a=res.assets[0];
      setter(`data:${a.mimeType||'image/jpeg'};base64,${a.base64}`);
    }
  }

  function resetBook() {
    setBookTitle(''); setBookAuthor(''); setBookCover(null);
  }

  function addBook() {
    if (!bookTitle.trim()) return Alert.alert('Brakuje tytułu','Wpisz tytuł książki.');
    const b={
      id:uid('book'), title:bookTitle.trim(), author:bookAuthor.trim(),
      cover:bookCover, createdAt:Date.now(), finished:false, notes:[]
    };
    setData(d=>({...d,books:[b,...d.books]}));
    resetBook(); setBookModal(false); setSelectedId(b.id);
  }

  function toggleFinished() {
    if (!selected) return;
    if (selected.finished) {
      setData(d=>({...d,books:d.books.map(b=>b.id===selected.id?{...b,finished:false}:b)}));
      return;
    }
    setData(d=>({...d,books:d.books.map(b=>b.id===selected.id?{...b,finished:true}:b)}));
    setTimeout(()=>{
      Alert.alert(
        'Książka przeczytana ✓',
        'Teraz odpowiedz na 3 pytania. Dzięki temu za kilka tygodni nadal będziesz pamiętać, co było w niej najważniejsze.',
        [
          {text:'Później',style:'cancel'},
          {text:'3 PYTANIA',onPress:()=>openMemory(selected)}
        ]
      );
    },120);
  }

  function deleteBook() {
    if (!selected) return;
    Alert.alert('Usunąć książkę?','Usunięte zostaną też wszystkie notatki.',[
      {text:'Anuluj',style:'cancel'},
      {text:'Usuń',style:'destructive',onPress:()=>{
        setData(d=>({
          ...d,
          books:d.books.filter(b=>b.id!==selected.id),
          weeklyFocus:d.weeklyFocus?.bookId===selected.id?null:d.weeklyFocus
        }));
        setSelectedId(null);
      }}
    ]);
  }

  function resetNote() {
    setNoteType('idea'); setNoteText(''); setNotePage(''); setNoteImage(null);
  }

  function addNote() {
    if (!selected) return;
    if (noteType!=='photo' && !noteText.trim()) return Alert.alert('Brakuje treści','Zapisz krótką myśl.');
    if (noteType==='photo' && !noteImage && !noteText.trim()) return Alert.alert('Dodaj zdjęcie','Wybierz zdjęcie strony albo dopisz notatkę.');
    const n={id:uid('note'),type:noteType,text:noteText.trim(),page:notePage.trim(),image:noteImage,createdAt:Date.now()};
    setData(d=>({...d,books:d.books.map(b=>b.id===selected.id?{...b,notes:[n,...(b.notes||[])]}:b)}));
    resetNote(); setNoteModal(false);
  }

  function deleteNote(id) {
    if (!selected) return;
    Alert.alert('Usunąć notatkę?','',[
      {text:'Anuluj',style:'cancel'},
      {text:'Usuń',style:'destructive',onPress:()=>{
        setData(d=>({...d,books:d.books.map(b=>b.id===selected.id?{...b,notes:(b.notes||[]).filter(n=>n.id!==id)}:b)}));
      }}
    ]);
  }

  function toggleBookmark(bookId,noteId) {
    setData(d=>({
      ...d,
      books:d.books.map(b=>b.id===bookId
        ? {...b,notes:(b.notes||[]).map(n=>n.id===noteId?{...n,starred:!n.starred}:n)}
        : b)
    }));
  }

  function openBookFromBookmarks(bookId) {
    setSelectedId(bookId);
    setTab('books');
  }

  function openMemory(book=selected) {
    if (!book) return;
    const current = getMemory(book);
    let sentences = current.sentences;
    if (!sentences.some(x=>x.trim())) {
      const candidates = (book.notes||[])
        .filter(n=>['remember','idea','reflection'].includes(n.type) && (n.text||'').trim())
        .slice(0,3)
        .map(n=>n.text.trim());
      sentences = [...candidates,'','',''].slice(0,3);
    }
    setMemorySentences(sentences);
    setMemoryMeaning(current.meaning);
    setMemoryAction(current.action);
    setMemoryModal(true);
  }

  function updateMemorySentence(index,value) {
    setMemorySentences(prev => prev.map((x,i)=>i===index?value:x));
  }

  function saveMemory() {
    if (!selected) return;
    const sentences=memorySentences.map(x=>x.trim());
    if (sentences.some(x=>!x)) {
      return Alert.alert('Uzupełnij 3 zdania','Wpisz trzy najważniejsze zdania lub idee, które chcesz zachować z tej książki.');
    }
    if (!memoryMeaning.trim()) return Alert.alert('Pytanie 2','Napisz własnymi słowami, co te idee dla Ciebie znaczą.');
    if (!memoryAction.trim()) return Alert.alert('Pytanie 3','Napisz, co konkretnie zrobisz inaczej dzięki tej książce.');
    setData(d=>({...d,books:d.books.map(b=>{
      if (b.id!==selected.id) return b;
      const old=getMemory(b);
      return {...b,memory:{...old,sentences,meaning:memoryMeaning.trim(),action:memoryAction.trim(),updatedAt:Date.now()}};
    })}));
    setMemoryModal(false);
  }

  function openFullSummary(book=selected) {
    if (!book) return;
    const value = getFullSummary(book);
    setSummaryDraft(value);
    setSummaryEditing(!value.trim());
    setSummaryModal(true);
  }

  function closeFullSummary() {
    if (summaryEditing && summaryDraft !== getFullSummary(selected)) {
      Alert.alert('Niezapisane zmiany','Zamknąć bez zapisywania podsumowania?', [
        {text:'Zostań',style:'cancel'},
        {text:'Odrzuć zmiany',style:'destructive',onPress:()=>setSummaryModal(false)}
      ]);
      return;
    }
    setSummaryModal(false);
  }

  function saveFullSummary() {
    if (!selected) return;
    const text = summaryDraft.trim();
    if (!text) return Alert.alert('Puste podsumowanie','Napisz podsumowanie albo użyj przycisku „Szkic z notatek”.');
    setData(d => ({...d,books:d.books.map(b => b.id === selected.id
      ? {...b,fullSummary:text,fullSummaryUpdatedAt:Date.now()} : b)}));
    setSummaryDraft(text);
    setSummaryEditing(false);
  }

  function draftFullSummary() {
    if (!selected) return;
    const apply = () => setSummaryDraft(buildSummaryDraft(selected));
    if (!summaryDraft.trim()) return apply();
    Alert.alert('Zastąpić aktualny tekst?', 'Szkic zastąpi to, co jest teraz w polu edycji. Zapisane podsumowanie nie zmieni się, dopóki nie klikniesz „Zapisz”.', [
      {text:'Anuluj',style:'cancel'},
      {text:'Utwórz szkic',onPress:apply}
    ]);
  }

  function deleteFullSummary() {
    if (!selected) return;
    Alert.alert('Usunąć podsumowanie?', 'Pozostałe notatki i 3 pytania nie zostaną usunięte.', [
      {text:'Anuluj',style:'cancel'},
      {text:'Usuń',style:'destructive',onPress:()=>{
        setData(d=>({...d,books:d.books.map(b=>b.id===selected.id
          ? {...b,fullSummary:'',fullSummaryUpdatedAt:null} : b)}));
        setSummaryDraft('');
        setSummaryEditing(true);
      }}
    ]);
  }

  function openRecall() {
    if (!selected) return;
    if (memorySentenceCount(selected)===0) {
      return Alert.alert('Najpierw zapisz 3 pytania','Uzupełnij najważniejsze zdania, a potem użyj trybu „Z pamięci”.');
    }
    setRecallText('');
    setRecallReveal(false);
    setRecallModal(true);
  }

  function revealRecall() {
    if (!selected) return;
    setRecallReveal(true);
    setData(d=>({...d,books:d.books.map(b=>{
      if (b.id!==selected.id) return b;
      const old=getMemory(b);
      return {...b,memory:{...old,lastRecallAt:Date.now(),lastRecallText:recallText.trim()}};
    })}));
  }

  function setWeeklyIdea(sentence,index) {
    if (!selected || !sentence.trim()) return;
    const w={
      id:uid('week'),
      bookId:selected.id,
      bookTitle:selected.title,
      sentenceIndex:index,
      text:sentence.trim(),
      weekKey:weekKey(),
      setAt:Date.now()
    };
    setData(d=>({...d,weeklyFocus:w}));
    Alert.alert('Idea ustawiona ✓','Będzie przypięta na ekranie „Dzisiaj” przez ten tydzień.');
  }


  function runAdvisor() {
    if (advisorQuery.trim().length<3) {
      return Alert.alert('Napisz problem','Np. „Nie mogę się skupić i ciągle sięgam po telefon”.');
    }
    const matches=findAdvisorMatches(data.books,advisorScope,advisorQuery);
    setAdvisorResults(matches);
    setAdvisorSearched(true);
    const direct=matches.find(x=>x.type==='apply'||x.kind==='action');
    setAdvisorAction(direct?.text||'');
  }

  function clearAdvisor() {
    setAdvisorQuery('');
    setAdvisorResults([]);
    setAdvisorAction('');
    setAdvisorSearched(false);
  }

  function saveAdvisorAction() {
    const text=advisorAction.trim();
    if (!text) return Alert.alert('Napisz działanie','Zapisz jedną konkretną rzecz, którą zrobisz teraz.');
    const targetId=advisorScope!=='all' ? advisorScope : advisorResults[0]?.bookId;
    const target=data.books.find(b=>b.id===targetId);
    if (!target) return Alert.alert('Wybierz książkę','Wybierz konkretną książkę albo najpierw wyszukaj pasujące notatki.');
    const n={id:uid('note'),type:'apply',text,page:'',image:null,createdAt:Date.now()};
    setData(d=>({...d,books:d.books.map(b=>b.id===target.id?{...b,notes:[n,...(b.notes||[])]}:b)}));
    Alert.alert('Zapisane ✓',`Działanie trafiło do „Zastosuję” w książce „${target.title}”.`);
  }

  function openAdvisorBook(bookId) {
    setSelectedId(bookId);
    setTab('books');
  }

  function renderAdvisorScreen() {
    return (
      <ScrollView contentContainerStyle={{paddingBottom:110}} keyboardShouldPersistTaps="handled">
        <Header title="Co by powiedziała książka?" subtitle="TWOJE NOTATKI → TWÓJ PROBLEM"/>

        <View style={s.advisorIntro}>
          <Text style={s.advisorIntroTitle}>Zapytaj własną bibliotekę</Text>
          <Text style={s.advisorIntroText}>Napisz, z czym się teraz mierzysz. Aplikacja nie korzysta z internetu — szuka odpowiedzi tylko w Twoich zapisanych myślach, 3 najważniejszych ideach i rzeczach „Zastosuję”.</Text>
        </View>

        <Text style={s.advisorLabel}>GDZIE SZUKAĆ?</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.scopeRow} keyboardShouldPersistTaps="handled">
          <Pressable onPress={()=>{setAdvisorScope('all');setAdvisorResults([]);setAdvisorSearched(false)}} style={[s.scopeChip,advisorScope==='all'&&s.scopeChipActive]}>
            <Text style={[s.scopeText,advisorScope==='all'&&s.scopeTextActive]}>WSZYSTKIE KSIĄŻKI</Text>
          </Pressable>
          {data.books.map(book=>(
            <Pressable key={book.id} onPress={()=>{setAdvisorScope(book.id);setAdvisorResults([]);setAdvisorSearched(false)}} style={[s.scopeChip,advisorScope===book.id&&s.scopeChipActive]}>
              <Text numberOfLines={1} style={[s.scopeText,advisorScope===book.id&&s.scopeTextActive]}>{book.title}</Text>
            </Pressable>
          ))}
        </ScrollView>

        <TextInput
          style={[s.input,s.advisorInput]}
          placeholder="Np. Nie mogę się skupić, ciągle łapię telefon..."
          placeholderTextColor="#716A5E"
          value={advisorQuery}
          onChangeText={setAdvisorQuery}
          multiline
          textAlignVertical="top"
        />
        <View style={s.advisorButtons}>
          <Button label="SZUKAJ W MOICH NOTATKACH" onPress={runAdvisor}/>
          {(advisorQuery||advisorSearched) ? <Button label="WYCZYŚĆ" secondary onPress={clearAdvisor}/> : null}
        </View>

        {advisorSearched && advisorResults.length===0 ? (
          <View style={s.advisorNoMatch}>
            <Text style={s.advisorNoMatchTitle}>Nie znalazłem mocnego dopasowania</Text>
            <Text style={s.advisorNoMatchText}>Spróbuj opisać problem innymi słowami albo wybierz „Wszystkie książki”. Im więcej własnych notatek zapiszesz, tym lepiej ta funkcja działa.</Text>
          </View>
        ) : null}

        {advisorResults.length ? (
          <>
            <Text style={s.advisorLabel}>NAJBARDZIEJ PASUJE</Text>
            {advisorResults.map((item,index)=>(
              <View key={item.id} style={s.advisorResult}>
                <View style={s.advisorResultTop}>
                  <Text style={s.advisorRank}>{index+1}</Text>
                  <View style={{flex:1}}>
                    <Text style={s.advisorBook}>{item.bookTitle}</Text>
                    <Text style={s.advisorSource}>{item.label}{item.page?` · str. ${item.page}`:''}</Text>
                  </View>
                </View>
                <Text style={s.advisorQuote}>“{item.text}”</Text>
                <Pressable onPress={()=>openAdvisorBook(item.bookId)} style={s.advisorOpen}>
                  <Text style={s.advisorOpenText}>OTWÓRZ KSIĄŻKĘ →</Text>
                </Pressable>
              </View>
            ))}

            <View style={s.applyNow}>
              <Text style={s.applyNowKicker}>ZASTOSUJ TERAZ</Text>
              <Text style={s.applyNowTitle}>Jedna konkretna rzecz</Text>
              <Text style={s.applyNowText}>Nie kończ na przeczytaniu notatki. Zapisz jedno działanie wynikające z tego, co właśnie znalazłeś.</Text>
              <TextInput
                style={[s.input,s.applyNowInput]}
                placeholder="Np. odkładam telefon do drugiego pokoju i robię 50 min pracy..."
                placeholderTextColor="#716A5E"
                value={advisorAction}
                onChangeText={setAdvisorAction}
                multiline
                textAlignVertical="top"
              />
              <Button label="ZAPISZ JAKO „ZASTOSUJĘ”" onPress={saveAdvisorAction}/>
            </View>
          </>
        ) : null}
      </ScrollView>
    );
  }

  function BookmarksScreen() {
    return (
      <View style={{flex:1}}>
        <Header title="Zakładki" subtitle="NAJWAŻNIEJSZE NOTATKI"/>
        {bookmarkedNotes.length===0 ? (
          <Empty
            title="Nie masz jeszcze zakładek"
            body="Przy dowolnej notatce kliknij ☆. Zmieni się w ★ i pojawi się tutaj."
          />
        ) : (
          <FlatList
            data={bookmarkedNotes}
            keyExtractor={n=>`${n.bookId}_${n.id}`}
            contentContainerStyle={{paddingBottom:110}}
            renderItem={({item})=>(
              <NoteCard
                note={item}
                bookTitle={item.bookTitle}
                onToggleBookmark={()=>toggleBookmark(item.bookId,item.id)}
                onOpenBook={()=>openBookFromBookmarks(item.bookId)}
              />
            )}
          />
        )}
      </View>
    );
  }

  function BooksScreen() {
    return (
      <View style={{flex:1}}>
        <Header title="Twoje książki" subtitle="MAPA KSIĄŻKI"
          right={<Button label="+ KSIĄŻKA" small onPress={()=>setBookModal(true)}/>}/>
        {data.books.length===0 ? (
          <Empty title="Zacznij od jednej książki"
            body="Nie rób idealnych notatek. Zapisuj tylko to, co naprawdę chcesz zabrać ze sobą."
            action="+ DODAJ KSIĄŻKĘ" onPress={()=>setBookModal(true)}/>
        ) : (
          <FlatList
            data={data.books}
            keyExtractor={b=>b.id}
            contentContainerStyle={{paddingBottom:110}}
            renderItem={({item})=>(
              <Pressable style={s.bookCard} onPress={()=>setSelectedId(item.id)}>
                {item.cover
                  ? <Image source={{uri:item.cover}} style={s.cover}/>
                  : <View style={[s.cover,s.coverBlank]}><Text style={{fontSize:28}}>📖</Text></View>}
                <View style={s.bookInfo}>
                  <Text style={s.bookTitle}>{item.title}</Text>
                  <Text style={s.bookAuthor}>{item.author||'Autor niepodany'}</Text>
                  <View style={s.metaRow}>
                    <Text style={s.meta}>{(item.notes||[]).length} notatek</Text>
                    {memorySentenceCount(item)>0 ? <Text style={s.memoryMeta}>🧠 {memorySentenceCount(item)}/3</Text> : null}
                    {getFullSummary(item).trim() ? <Text style={s.memoryMeta}>✍ PODSUMOWANIE</Text> : null}
                    {item.finished ? <Text style={s.done}>PRZECZYTANA</Text> : null}
                  </View>
                </View>
                <Text style={s.chev}>›</Text>
              </Pressable>
            )}
          />
        )}
      </View>
    );
  }

  function TodayScreen() {
    return (
      <ScrollView contentContainerStyle={{paddingBottom:110}} keyboardShouldPersistTaps="handled">
        <Header title="Dzisiaj" subtitle="PAMIĘTAJ TO, CO WAŻNE"/>

        {activeWeekly ? (
          <View style={s.weekCard}>
            <Text style={s.weekKicker}>★ IDEA NA TEN TYDZIEŃ</Text>
            <Text style={s.weekText}>“{activeWeekly.text}”</Text>
            <Text style={s.weekBook}>{activeWeekly.bookTitle}</Text>
            <View style={{marginTop:16}}>
              <Button label="OTWÓRZ KSIĄŻKĘ" secondary onPress={()=>{setSelectedId(activeWeekly.bookId);setTab('books')}}/>
            </View>
          </View>
        ) : (
          <View style={s.weekEmpty}>
            <Text style={s.weekKicker}>★ IDEA NA TEN TYDZIEŃ</Text>
            <Text style={s.weekEmptyTitle}>Wybierz jedną rzecz, którą chcesz nosić w głowie przez 7 dni.</Text>
            <Text style={s.weekEmptyBody}>Otwórz książkę → „Zapamiętaj tę książkę” → wybierz jedno z 3 najważniejszych zdań.</Text>
          </View>
        )}

        <Text style={s.sectionKicker}>JEDNA LEKCJA NA DZIŚ</Text>
        {daily ? (
          <View style={s.lesson}>
            <Text style={s.lessonBook}>{daily.bookTitle}</Text>
            <Text style={s.lessonType}>{TYPE_MAP[daily.type]?.emoji} {TYPE_MAP[daily.type]?.label}</Text>
            <Text style={s.lessonText}>“{daily.text}”</Text>
            {daily.page ? <Text style={s.meta}>str. {daily.page}</Text> : null}
            <View style={{marginTop:16}}>
              <Button label="OTWÓRZ KSIĄŻKĘ" secondary onPress={()=>{setSelectedId(daily.bookId);setTab('books')}}/>
            </View>
          </View>
        ) : (
          <Empty title="Najpierw coś zapisz"
            body="Kiedy dodasz pierwsze myśli z książek, codziennie pokażę Ci jedną z nich."/>
        )}
        <View style={s.info}>
          <Text style={s.infoTitle}>Najpierw przypomnij sobie sam</Text>
          <Text style={s.infoText}>Najwięcej zapamiętujesz wtedy, gdy próbujesz odtworzyć wiedzę bez patrzenia. W przeczytanej książce użyj przycisku „Z PAMIĘCI”, a dopiero później odsłoń swoje 3 zdania.</Text>
        </View>
      </ScrollView>
    );
  }

  function BookScreen() {
    if (!selected) return null;
    const notes=selected.notes||[];
    const strongest=notes.filter(n=>['remember','idea','reflection'].includes(n.type)&&n.text);
    const apply=notes.filter(n=>n.type==='apply'&&n.text);
    const questions=notes.filter(n=>n.type==='question'&&n.text);
    const memory=getMemory(selected);
    const hasMemory=memorySentenceCount(selected)>0;
    const complete=memoryComplete(selected);

    return (
      <View style={{flex:1}}>
        <Header title={selected.title} subtitle={selected.author||'TWOJA MAPA'} onBack={()=>setSelectedId(null)}
          right={<Button label="+ NOTATKA" small onPress={()=>setNoteModal(true)}/>}/>
        <ScrollView contentContainerStyle={{paddingBottom:80}} keyboardShouldPersistTaps="handled">
          <View style={s.hero}>
            {selected.cover
              ? <Image source={{uri:selected.cover}} style={s.heroCover}/>
              : <View style={[s.heroCover,s.coverBlank]}><Text style={{fontSize:32}}>📚</Text></View>}
            <View style={{flex:1}}>
              <Text style={s.heroTitle}>{selected.title}</Text>
              <Text style={s.bookAuthor}>{selected.author||'Autor niepodany'}</Text>
              <Text style={[s.meta,{marginTop:10}]}>{notes.length} zapisanych rzeczy</Text>
              <View style={s.actionRow}>
                <Button label={selected.finished?'✓ PRZECZYTANA':'OZNACZ JAKO PRZECZYTANĄ'} secondary onPress={toggleFinished}/>
                <Button label="USUŃ" danger onPress={deleteBook}/>
              </View>
            </View>
          </View>

          <View style={s.memoryCard}>
            <Text style={s.memoryKicker}>🧠 ZAPAMIĘTAJ TĘ KSIĄŻKĘ</Text>
            <Text style={s.memoryTitle}>3 pytania, żeby coś zostało</Text>
            <Text style={s.memoryIntro}>Nie streszczaj książki. Wybierz tylko to, co chcesz umieć odtworzyć z pamięci za kilka miesięcy.</Text>
            <View style={s.memoryActions}>
              <Button label={complete?'EDYTUJ 3 PYTANIA':'UZUPEŁNIJ 3 PYTANIA'} onPress={()=>openMemory(selected)}/>
              <Button label="Z PAMIĘCI" secondary disabled={!hasMemory} onPress={openRecall}/>
            </View>

            {hasMemory ? (
              <View style={s.memorySaved}>
                <Text style={s.memorySection}>1. 3 NAJWAŻNIEJSZE ZDANIA</Text>
                {memory.sentences.map((sentence,index)=> sentence.trim() ? (
                  <View key={index} style={s.sentenceCard}>
                    <View style={s.sentenceNumber}><Text style={s.sentenceNumberText}>{index+1}</Text></View>
                    <View style={{flex:1}}>
                      <Text style={s.sentenceText}>{sentence}</Text>
                      <Pressable style={s.weekPick} onPress={()=>setWeeklyIdea(sentence,index)}>
                        <Text style={s.weekPickText}>{activeWeekly?.bookId===selected.id && activeWeekly?.text===sentence ? '★ IDEA TEGO TYGODNIA' : '☆ USTAW NA TEN TYDZIEŃ'}</Text>
                      </Pressable>
                    </View>
                  </View>
                ) : null)}

                {memory.meaning ? <>
                  <Text style={s.memorySection}>2. WŁASNYMI SŁOWAMI</Text>
                  <Text style={s.memoryAnswer}>{memory.meaning}</Text>
                </> : null}
                {memory.action ? <>
                  <Text style={s.memorySection}>3. CO ZROBIĘ INACZEJ</Text>
                  <Text style={s.memoryAnswer}>{memory.action}</Text>
                </> : null}
                {memory.lastRecallAt ? <Text style={s.lastRecall}>Ostatnia próba z pamięci: {dateLabel(memory.lastRecallAt)}</Text> : null}
              </View>
            ) : null}
          </View>

          <View style={s.fullSummaryCard}>
            <Text style={s.fullSummaryKicker}>📖 PODSUMOWANIE CAŁEJ KSIĄŻKI</Text>
            <Text style={s.fullSummaryTitle}>{getFullSummary(selected).trim() ? 'Twoje podsumowanie' : 'Zapisz całą książkę własnymi słowami'}</Text>
            <Text style={s.fullSummaryDescription}>
              {getFullSummary(selected).trim()
                ? 'Wróć do całej treści w każdej chwili. Możesz ją czytać, uzupełniać i poprawiać.'
                : 'Nie tylko 3 najważniejsze myśli — tutaj masz miejsce na długie podsumowanie książki, od początku do końca.'}
            </Text>
            {getFullSummary(selected).trim() ? (
              <>
                <Text style={s.fullSummaryPreview} numberOfLines={5}>{getFullSummary(selected)}</Text>
                <Text style={s.fullSummaryMeta}>
                  {summaryWordCount(getFullSummary(selected))} słów
                  {selected.fullSummaryUpdatedAt ? `  •  Zapisano ${dateLabel(selected.fullSummaryUpdatedAt)}` : ''}
                </Text>
              </>
            ) : null}
            <View style={{marginTop:16}}>
              <Button label={getFullSummary(selected).trim() ? 'OTWÓRZ PODSUMOWANIE' : 'NAPISZ PODSUMOWANIE'} onPress={()=>openFullSummary(selected)}/>
            </View>
          </View>

          {selected.finished && notes.length ? (
            <View style={s.summary}>
              <Text style={s.summaryKicker}>CO ZOSTAŁO MI Z TEJ KSIĄŻKI?</Text>
              <Text style={s.summaryTitle}>Najmocniejsze rzeczy</Text>
              {strongest.slice(0,5).map(n=><Text key={n.id} style={s.summaryLine}>• {n.text}</Text>)}
              {apply.length ? <>
                <Text style={[s.summaryTitle,{marginTop:16}]}>Do zastosowania</Text>
                {apply.slice(0,5).map(n=><Text key={n.id} style={s.summaryLine}>✓ {n.text}</Text>)}
              </> : null}
              {questions.length ? <>
                <Text style={[s.summaryTitle,{marginTop:16}]}>Otwarte pytania</Text>
                {questions.slice(0,5).map(n=><Text key={n.id} style={s.summaryLine}>? {n.text}</Text>)}
              </> : null}
            </View>
          ) : null}

          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.legend}>
            {TYPES.map(([k,e,l])=><View key={k} style={s.legendPill}><Text style={s.legendText}>{e} {l}</Text></View>)}
          </ScrollView>

          {notes.length===0 ? (
            <Empty title="Ta mapa jest jeszcze pusta"
              body="Dodaj pierwszą myśl, pytanie, rzecz do zastosowania albo zdjęcie strony."
              action="+ DODAJ NOTATKĘ" onPress={()=>setNoteModal(true)}/>
          ) : notes.map(n=>(
            <NoteCard
              key={n.id}
              note={n}
              onDelete={()=>deleteNote(n.id)}
              onToggleBookmark={()=>toggleBookmark(selected.id,n.id)}
            />
          ))}
        </ScrollView>
      </View>
    );
  }

  if (!loaded) return <SafeAreaView style={s.safe}><View style={s.loading}><Text style={s.loadingText}>Mapa Książki</Text></View></SafeAreaView>;

  const recallMemory = selected ? getMemory(selected) : emptyMemory();

  return (
    <SafeAreaView style={s.safe}>
      <KeyboardAvoidingView style={{flex:1}} behavior={Platform.OS==='ios'?'padding':undefined}>
        <View style={s.app}>
          {selected ? <BookScreen/> : (
            tab==='books' ? <BooksScreen/> :
            tab==='today' ? <TodayScreen/> :
            tab==='saved' ? <BookmarksScreen/> :
            renderAdvisorScreen()
          )}

          {!selected ? (
            <View style={s.tabs}>
              <Pressable style={s.tab} onPress={()=>setTab('books')}>
                <Text style={[s.tabIcon,tab==='books'&&s.active]}>▦</Text>
                <Text style={[s.tabText,tab==='books'&&s.active]}>KSIĄŻKI</Text>
              </Pressable>
              <Pressable style={s.tab} onPress={()=>setTab('today')}>
                <Text style={[s.tabIcon,tab==='today'&&s.active]}>✦</Text>
                <Text style={[s.tabText,tab==='today'&&s.active]}>DZISIAJ</Text>
              </Pressable>
              <Pressable style={s.tab} onPress={()=>setTab('saved')}>
                <Text style={[s.tabIcon,tab==='saved'&&s.active]}>★</Text>
                <Text style={[s.tabText,tab==='saved'&&s.active]}>ZAKŁADKI</Text>
              </Pressable>
              <Pressable style={s.tab} onPress={()=>setTab('advisor')}>
                <Text style={[s.tabIcon,tab==='advisor'&&s.active]}>◎</Text>
                <Text style={[s.tabText,tab==='advisor'&&s.active]}>DORADCA</Text>
              </Pressable>
            </View>
          ) : null}

          <Modal visible={bookModal} transparent animationType="slide" onRequestClose={()=>setBookModal(false)}>
            <KeyboardAvoidingView style={s.modalShade} behavior={Platform.OS==='ios'?'padding':undefined}>
              <View style={s.sheet}>
                <Text style={s.kicker}>NOWA KSIĄŻKA</Text>
                <Text style={s.modalTitle}>Dodaj do biblioteki</Text>
                <Pressable style={s.coverPicker} onPress={()=>chooseImage(setBookCover)}>
                  {bookCover ? <Image source={{uri:bookCover}} style={s.coverPickerImage}/> : <Text style={s.coverPickerText}>+ OKŁADKA</Text>}
                </Pressable>
                <TextInput style={s.input} placeholder="Tytuł książki" placeholderTextColor="#716A5E" value={bookTitle} onChangeText={setBookTitle}/>
                <TextInput style={s.input} placeholder="Autor" placeholderTextColor="#716A5E" value={bookAuthor} onChangeText={setBookAuthor}/>
                <View style={s.modalActions}>
                  <Button label="ANULUJ" secondary onPress={()=>{setBookModal(false);resetBook()}}/>
                  <Button label="DODAJ" onPress={addBook}/>
                </View>
              </View>
            </KeyboardAvoidingView>
          </Modal>

          <Modal visible={noteModal} transparent animationType="slide" onRequestClose={()=>setNoteModal(false)}>
            <KeyboardAvoidingView style={s.modalShade} behavior={Platform.OS==='ios'?'padding':undefined}>
              <ScrollView contentContainerStyle={{flexGrow:1,justifyContent:'flex-end'}} keyboardShouldPersistTaps="handled">
                <View style={s.sheet}>
                  <Text style={s.kicker}>NOWA RZECZ DO MAPY</Text>
                  <Text style={s.modalTitle}>Co chcesz zachować?</Text>

                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.typeRow} keyboardShouldPersistTaps="handled">
                    {TYPES.map(([k,e,l])=>(
                      <Pressable key={k} onPress={()=>setNoteType(k)} style={[s.typeBtn,noteType===k&&s.typeBtnActive]}>
                        <Text style={[s.typeText,noteType===k&&s.typeTextActive]}>{e} {l}</Text>
                      </Pressable>
                    ))}
                  </ScrollView>

                  {noteType==='photo' ? (
                    <Pressable style={s.photoPicker} onPress={()=>chooseImage(setNoteImage)}>
                      {noteImage ? <Image source={{uri:noteImage}} style={s.photoPreview}/> : <Text style={s.photoPickerText}>📸 DODAJ ZDJĘCIE STRONY</Text>}
                    </Pressable>
                  ) : null}

                  <TextInput
                    style={[s.input,s.textarea]}
                    placeholder={
                      noteType==='apply'?'Co konkretnie zastosujesz?':
                      noteType==='question'?'Jakie pytanie Ci zostało?':
                      noteType==='remember'?'Co chcesz zapamiętać na długo?':
                      noteType==='reflection'?'Co Ty o tym myślisz?':
                      'Zapisz jedną krótką myśl...'
                    }
                    placeholderTextColor="#716A5E"
                    value={noteText}
                    onChangeText={setNoteText}
                    multiline
                    textAlignVertical="top"
                  />
                  <TextInput style={s.input} placeholder="Numer strony (opcjonalnie)" placeholderTextColor="#716A5E"
                    value={notePage} onChangeText={setNotePage} keyboardType="number-pad"/>
                  <View style={s.modalActions}>
                    <Button label="ANULUJ" secondary onPress={()=>{setNoteModal(false);resetNote()}}/>
                    <Button label="ZAPISZ" onPress={addNote}/>
                  </View>
                </View>
              </ScrollView>
            </KeyboardAvoidingView>
          </Modal>

          <Modal visible={memoryModal} transparent animationType="slide" onRequestClose={()=>setMemoryModal(false)}>
            <KeyboardAvoidingView style={s.modalShade} behavior={Platform.OS==='ios'?'padding':'height'} keyboardVerticalOffset={20}>
              <View style={s.sheetTall}>
                <ScrollView
                  style={{flex:1}}
                  contentContainerStyle={s.memoryScrollContent}
                  keyboardShouldPersistTaps="handled"
                  keyboardDismissMode="on-drag"
                  showsVerticalScrollIndicator
                  nestedScrollEnabled
                >
                  <Text style={s.kicker}>ZAPAMIĘTAJ TĘ KSIĄŻKĘ</Text>
                  <Text style={s.modalTitle}>3 pytania</Text>

                  <Text style={s.questionNo}>PYTANIE 1</Text>
                  <Text style={s.questionTitle}>Jakie 3 zdania z tej książki chcę zapamiętać?</Text>
                  {[0,1,2].map(i=>(
                    <View key={i} style={s.numberedInputRow}>
                      <View style={s.inputNumber}><Text style={s.inputNumberText}>{i+1}</Text></View>
                      <TextInput
                        style={[s.input,s.memoryInput]}
                        placeholder={`Najważniejsze zdanie ${i+1}`}
                        placeholderTextColor="#716A5E"
                        value={memorySentences[i]}
                        onChangeText={v=>updateMemorySentence(i,v)}
                        multiline
                        textAlignVertical="top"
                      />
                    </View>
                  ))}

                  <Text style={s.questionNo}>PYTANIE 2</Text>
                  <Text style={s.questionTitle}>Co te zdania znaczą moimi własnymi słowami?</Text>
                  <TextInput
                    style={[s.input,s.textarea]}
                    placeholder="Wyjaśnij to tak, jakbyś tłumaczył komuś bez patrzenia do książki..."
                    placeholderTextColor="#716A5E"
                    value={memoryMeaning}
                    onChangeText={setMemoryMeaning}
                    multiline
                    textAlignVertical="top"
                  />

                  <Text style={s.questionNo}>PYTANIE 3</Text>
                  <Text style={s.questionTitle}>Co konkretnie zrobię inaczej dzięki tej książce?</Text>
                  <TextInput
                    style={[s.input,s.textarea]}
                    placeholder="Jedna konkretna zmiana, którą chcesz wprowadzić..."
                    placeholderTextColor="#716A5E"
                    value={memoryAction}
                    onChangeText={setMemoryAction}
                    multiline
                    textAlignVertical="top"
                  />

                  <View style={s.modalActions}>
                    <Button label="ANULUJ" secondary onPress={()=>setMemoryModal(false)}/>
                    <Button label="ZAPISZ 3 PYTANIA" onPress={saveMemory}/>
                  </View>
                </ScrollView>
              </View>
            </KeyboardAvoidingView>
          </Modal>

          <Modal visible={summaryModal} animationType="slide" onRequestClose={closeFullSummary}>
            <SafeAreaView style={s.fullSummarySafe}>
              <KeyboardAvoidingView style={{flex:1}} behavior={Platform.OS==='ios'?'padding':undefined}>
                <View style={s.fullSummaryHeader}>
                  <View style={{flex:1}}>
                    <Text style={s.kicker}>PODSUMOWANIE CAŁEJ KSIĄŻKI</Text>
                    <Text style={s.fullSummaryBookName} numberOfLines={2}>{selected?.title || 'Książka'}</Text>
                  </View>
                  <Pressable onPress={closeFullSummary} style={s.fullSummaryClose}>
                    <Text style={s.fullSummaryCloseText}>ZAMKNIJ ✕</Text>
                  </Pressable>
                </View>

                {summaryEditing ? (
                  <ScrollView style={{flex:1}} contentContainerStyle={s.fullSummaryBody} keyboardShouldPersistTaps="always" keyboardDismissMode="none" showsVerticalScrollIndicator>
                    <Text style={s.fullSummaryHelp}>Opisz całą książkę po swojemu: główne tematy, rozwój myśli autora, najważniejsze rozdziały i Twoje wnioski. Tekst może być dowolnie długi.</Text>
                    <TextInput
                      style={s.fullSummaryInput}
                      placeholder="O czym jest książka? Jakie są jej najważniejsze idee i co warto z niej zapamiętać? Napisz tutaj całe podsumowanie..."
                      placeholderTextColor="#716A5E"
                      value={summaryDraft}
                      onChangeText={setSummaryDraft}
                      multiline
                      scrollEnabled
                      textAlignVertical="top"
                      autoCorrect
                    />
                    <Text style={s.fullSummaryMeta}>{summaryWordCount(summaryDraft)} słów</Text>
                    <View style={{marginTop:12,marginBottom:22}}>
                      <Button label="UTWÓRZ SZKIC Z MOICH NOTATEK" secondary onPress={draftFullSummary}/>
                      <Text style={s.fullSummaryTip}>Szkic zbiera wyłącznie Twoje notatki i 3 pytania. Nie jest streszczeniem wygenerowanym z pełnej treści książki. Możesz go dowolnie poprawiać.</Text>
                    </View>
                  </ScrollView>
                ) : (
                  <ScrollView style={{flex:1}} contentContainerStyle={s.fullSummaryBody} showsVerticalScrollIndicator>
                    <Text style={s.fullSummaryReadText} selectable>{getFullSummary(selected)}</Text>
                    <Text style={[s.fullSummaryMeta,{marginTop:18}]}>
                      {summaryWordCount(getFullSummary(selected))} słów
                      {selected?.fullSummaryUpdatedAt ? `  •  Zapisano ${dateLabel(selected.fullSummaryUpdatedAt)}` : ''}
                    </Text>
                    <View style={{marginTop:24,marginBottom:28}}>
                      <Button label="USUŃ PODSUMOWANIE" danger onPress={deleteFullSummary}/>
                    </View>
                  </ScrollView>
                )}

                <View style={s.fullSummaryFooter}>
                  {summaryEditing ? (
                    <>
                      <View style={{flex:1}}><Button label="ANULUJ" secondary onPress={closeFullSummary}/></View>
                      <View style={{flex:1.8}}><Button label="ZAPISZ PODSUMOWANIE" onPress={saveFullSummary}/></View>
                    </>
                  ) : (
                    <>
                      <View style={{flex:1}}><Button label="ZAMKNIJ" secondary onPress={closeFullSummary}/></View>
                      <View style={{flex:1.6}}><Button label="EDYTUJ" onPress={()=>setSummaryEditing(true)}/></View>
                    </>
                  )}
                </View>
              </KeyboardAvoidingView>
            </SafeAreaView>
          </Modal>

          <Modal visible={recallModal} transparent animationType="slide" onRequestClose={()=>setRecallModal(false)}>
            <KeyboardAvoidingView style={s.modalShade} behavior={Platform.OS==='ios'?'padding':'height'} keyboardVerticalOffset={20}>
              <ScrollView contentContainerStyle={{flexGrow:1,justifyContent:'flex-end'}} keyboardShouldPersistTaps="handled">
                <View style={[s.sheetTall,s.sheetTallPadded]}>
                  <Text style={s.kicker}>TRYB Z PAMIĘCI</Text>
                  <Text style={s.modalTitle}>{selected?.title||'Książka'}</Text>
                  <Text style={s.recallLead}>Bez podglądania: co pamiętasz z tej książki?</Text>
                  <Text style={s.recallHint}>Spróbuj odtworzyć 3 najważniejsze idee własnymi słowami. Dopiero potem odsłoń zapisane zdania.</Text>
                  <TextInput
                    style={[s.input,s.recallInput]}
                    placeholder="1. ...\n2. ...\n3. ..."
                    placeholderTextColor="#716A5E"
                    value={recallText}
                    onChangeText={setRecallText}
                    multiline
                    textAlignVertical="top"
                  />

                  {!recallReveal ? (
                    <Button label="POKAŻ MOJE 3 ZDANIA" onPress={revealRecall}/>
                  ) : (
                    <View style={s.revealBox}>
                      <Text style={s.revealKicker}>PORÓWNAJ Z TYM, CO ZAPISAŁEŚ</Text>
                      {recallMemory.sentences.map((x,i)=>x.trim()?<Text key={i} style={s.revealLine}>{i+1}. {x}</Text>:null)}
                      {recallMemory.meaning ? <>
                        <Text style={s.revealSub}>Własnymi słowami</Text>
                        <Text style={s.revealBody}>{recallMemory.meaning}</Text>
                      </> : null}
                      {recallMemory.action ? <>
                        <Text style={s.revealSub}>Co chciałeś zrobić inaczej</Text>
                        <Text style={s.revealBody}>{recallMemory.action}</Text>
                      </> : null}
                    </View>
                  )}
                  <View style={s.modalActions}>
                    <Button label="ZAMKNIJ" secondary onPress={()=>setRecallModal(false)}/>
                  </View>
                </View>
              </ScrollView>
            </KeyboardAvoidingView>
          </Modal>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const s=StyleSheet.create({
  safe:{flex:1,backgroundColor:C.bg},
  app:{flex:1,paddingHorizontal:18},
  loading:{flex:1,alignItems:'center',justifyContent:'center'},
  loadingText:{color:C.gold,fontSize:28,fontWeight:'900'},

  header:{paddingTop:12,paddingBottom:18,flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:10},
  headerLeft:{flex:1,flexDirection:'row',alignItems:'center',gap:10},
  kicker:{color:C.gold,fontSize:10,fontWeight:'900',letterSpacing:1.5},
  title:{color:C.text,fontSize:30,fontWeight:'900',marginTop:3,letterSpacing:-.8},
  back:{width:40,height:40,borderRadius:12,backgroundColor:C.panel,alignItems:'center',justifyContent:'center'},
  backText:{color:C.text,fontSize:34,lineHeight:34},

  btn:{backgroundColor:C.gold,borderRadius:13,paddingHorizontal:16,paddingVertical:13,alignItems:'center',justifyContent:'center'},
  btnSmall:{paddingHorizontal:12,paddingVertical:10},
  btnSecondary:{backgroundColor:'transparent',borderWidth:1,borderColor:C.line},
  btnDanger:{backgroundColor:'transparent',borderWidth:1,borderColor:'#4B2929'},
  btnDisabled:{opacity:.38},
  btnText:{color:'#171109',fontWeight:'900',fontSize:11},
  btnTextSecondary:{color:C.text},
  btnTextDanger:{color:C.red},
  btnTextDisabled:{color:C.muted},

  empty:{backgroundColor:C.panel,borderWidth:1,borderColor:C.line,borderRadius:20,padding:22,marginTop:10},
  emptyTitle:{color:C.text,fontSize:21,fontWeight:'900'},
  emptyBody:{color:C.muted,fontSize:14,lineHeight:21,marginTop:8,marginBottom:18},

  bookCard:{flexDirection:'row',alignItems:'center',backgroundColor:C.panel,borderWidth:1,borderColor:C.line,borderRadius:18,padding:12,marginBottom:12},
  cover:{width:68,height:94,borderRadius:10,backgroundColor:C.panel2},
  coverBlank:{alignItems:'center',justifyContent:'center'},
  bookInfo:{flex:1,paddingHorizontal:14},
  bookTitle:{color:C.text,fontSize:18,fontWeight:'900'},
  bookAuthor:{color:C.muted,marginTop:4,fontSize:13},
  metaRow:{flexDirection:'row',gap:8,alignItems:'center',marginTop:10,flexWrap:'wrap'},
  meta:{color:C.muted,fontSize:11},
  memoryMeta:{color:C.gold,fontSize:10,fontWeight:'800'},
  done:{color:C.green,fontSize:9,fontWeight:'900',letterSpacing:1},
  chev:{color:C.gold,fontSize:32},

  weekCard:{backgroundColor:'#1A150C',borderWidth:1,borderColor:'#66502A',borderRadius:22,padding:22,marginBottom:18},
  weekKicker:{color:C.gold,fontSize:10,fontWeight:'900',letterSpacing:1.4},
  weekText:{color:C.text,fontSize:24,fontWeight:'900',lineHeight:33,marginTop:15},
  weekBook:{color:C.muted,fontSize:12,marginTop:12},
  weekEmpty:{backgroundColor:C.panel,borderWidth:1,borderColor:C.line,borderRadius:20,padding:20,marginBottom:18},
  weekEmptyTitle:{color:C.text,fontSize:17,fontWeight:'900',lineHeight:23,marginTop:10},
  weekEmptyBody:{color:C.muted,fontSize:13,lineHeight:20,marginTop:8},
  sectionKicker:{color:C.muted,fontSize:10,fontWeight:'900',letterSpacing:1.4,marginBottom:10,marginTop:4},

  lesson:{backgroundColor:C.panel,borderWidth:1,borderColor:'#4A3C22',borderRadius:22,padding:24},
  lessonBook:{color:C.gold,fontSize:12,fontWeight:'900',letterSpacing:1},
  lessonType:{color:C.muted,marginTop:10,fontSize:12},
  lessonText:{color:C.text,fontSize:24,fontWeight:'800',lineHeight:34,marginVertical:18},
  info:{marginTop:16,backgroundColor:C.panel,borderRadius:18,padding:20,borderWidth:1,borderColor:C.line},
  infoTitle:{color:C.text,fontWeight:'900',fontSize:17},
  infoText:{color:C.muted,lineHeight:21,marginTop:8},

  advisorIntro:{backgroundColor:'#15120C',borderWidth:1,borderColor:'#4A3C22',borderRadius:20,padding:20,marginBottom:16},
  advisorIntroTitle:{color:C.text,fontSize:20,fontWeight:'900'},
  advisorIntroText:{color:C.muted,fontSize:13,lineHeight:20,marginTop:8},
  advisorLabel:{color:C.gold,fontSize:10,fontWeight:'900',letterSpacing:1.3,marginTop:6,marginBottom:9},
  scopeRow:{gap:8,paddingBottom:12},
  scopeChip:{maxWidth:180,borderWidth:1,borderColor:C.line,backgroundColor:C.panel,borderRadius:999,paddingHorizontal:13,paddingVertical:9},
  scopeChipActive:{borderColor:C.gold,backgroundColor:'#2A2214'},
  scopeText:{color:C.muted,fontSize:10,fontWeight:'900'},
  scopeTextActive:{color:C.gold},
  advisorInput:{minHeight:125,fontSize:16,lineHeight:23},
  advisorButtons:{flexDirection:'row',gap:9,flexWrap:'wrap',marginBottom:18},
  advisorNoMatch:{backgroundColor:C.panel,borderWidth:1,borderColor:C.line,borderRadius:18,padding:18,marginTop:2},
  advisorNoMatchTitle:{color:C.text,fontWeight:'900',fontSize:17},
  advisorNoMatchText:{color:C.muted,lineHeight:20,fontSize:13,marginTop:7},
  advisorResult:{backgroundColor:C.panel,borderWidth:1,borderColor:C.line,borderRadius:18,padding:17,marginBottom:11},
  advisorResultTop:{flexDirection:'row',alignItems:'center',gap:10},
  advisorRank:{width:28,height:28,borderRadius:999,backgroundColor:'#2B2315',color:C.gold,textAlign:'center',fontWeight:'900',fontSize:12,lineHeight:28},
  advisorBook:{color:C.gold,fontSize:11,fontWeight:'900'},
  advisorSource:{color:C.muted,fontSize:10,marginTop:3},
  advisorQuote:{color:C.text,fontSize:17,lineHeight:25,fontWeight:'700',marginTop:14},
  advisorOpen:{alignSelf:'flex-start',paddingTop:12,paddingBottom:2},
  advisorOpenText:{color:C.gold,fontSize:9,fontWeight:'900',letterSpacing:.8},
  applyNow:{backgroundColor:'#17130D',borderWidth:1,borderColor:'#5B4828',borderRadius:21,padding:20,marginTop:8},
  applyNowKicker:{color:C.gold,fontSize:10,fontWeight:'900',letterSpacing:1.3},
  applyNowTitle:{color:C.text,fontSize:21,fontWeight:'900',marginTop:7},
  applyNowText:{color:C.muted,fontSize:13,lineHeight:20,marginTop:7,marginBottom:12},
  applyNowInput:{minHeight:92},

  tabs:{position:'absolute',left:18,right:18,bottom:12,height:68,backgroundColor:'#11100D',borderWidth:1,borderColor:C.line,borderRadius:22,flexDirection:'row'},
  tab:{flex:1,alignItems:'center',justifyContent:'center'},
  tabIcon:{color:C.muted,fontSize:20,fontWeight:'900'},
  tabText:{color:C.muted,fontSize:9,fontWeight:'900',marginTop:3,letterSpacing:1},
  active:{color:C.gold},

  hero:{flexDirection:'row',gap:16,backgroundColor:C.panel,borderWidth:1,borderColor:C.line,borderRadius:20,padding:14,marginBottom:18},
  heroCover:{width:92,height:132,borderRadius:12,backgroundColor:C.panel2},
  heroTitle:{color:C.text,fontSize:22,fontWeight:'900'},
  actionRow:{flexDirection:'row',flexWrap:'wrap',gap:8,marginTop:14},

  memoryCard:{backgroundColor:'#12100C',borderWidth:1,borderColor:'#5B4828',borderRadius:22,padding:20,marginBottom:18},
  memoryKicker:{color:C.gold,fontSize:10,fontWeight:'900',letterSpacing:1.2},
  memoryTitle:{color:C.text,fontSize:22,fontWeight:'900',marginTop:8},
  memoryIntro:{color:C.muted,fontSize:13,lineHeight:20,marginTop:8},
  memoryActions:{flexDirection:'row',flexWrap:'wrap',gap:9,marginTop:16},
  memorySaved:{marginTop:20,borderTopWidth:1,borderTopColor:C.line,paddingTop:4},
  memorySection:{color:C.gold,fontSize:10,fontWeight:'900',letterSpacing:1.2,marginTop:18,marginBottom:9},
  memoryAnswer:{color:C.text,fontSize:15,lineHeight:22,backgroundColor:C.panel,borderRadius:13,padding:14,borderWidth:1,borderColor:C.line},
  sentenceCard:{flexDirection:'row',gap:10,backgroundColor:C.panel,borderWidth:1,borderColor:C.line,borderRadius:14,padding:13,marginBottom:9},
  sentenceNumber:{width:27,height:27,borderRadius:999,backgroundColor:'#2B2315',alignItems:'center',justifyContent:'center'},
  sentenceNumberText:{color:C.gold,fontWeight:'900',fontSize:12},
  sentenceText:{color:C.text,fontSize:15,lineHeight:22,fontWeight:'700'},
  weekPick:{alignSelf:'flex-start',marginTop:9,paddingVertical:5},
  weekPickText:{color:C.gold,fontWeight:'900',fontSize:9,letterSpacing:.7},
  lastRecall:{color:C.muted,fontSize:10,marginTop:15},

  summary:{backgroundColor:'#17130D',borderWidth:1,borderColor:'#4A3C22',borderRadius:20,padding:20,marginBottom:18},
  summaryKicker:{color:C.gold,fontWeight:'900',fontSize:10,letterSpacing:1.3},
  summaryTitle:{color:C.text,fontSize:18,fontWeight:'900',marginTop:8,marginBottom:8},
  summaryLine:{color:'#DED6C7',lineHeight:21,marginBottom:6},

  fullSummaryCard:{backgroundColor:'#15130F',borderWidth:1,borderColor:'#63502C',borderRadius:20,padding:20,marginBottom:18},
  fullSummaryKicker:{color:C.gold,fontSize:10,fontWeight:'900',letterSpacing:1.1},
  fullSummaryTitle:{color:C.text,fontSize:21,fontWeight:'900',marginTop:9,lineHeight:28},
  fullSummaryDescription:{color:C.muted,fontSize:13,lineHeight:20,marginTop:8},
  fullSummaryPreview:{color:C.text,fontSize:14,lineHeight:22,marginTop:15},
  fullSummaryMeta:{color:C.gold,fontSize:11,marginTop:11,fontWeight:'700'},
  fullSummarySafe:{flex:1,backgroundColor:C.bg},
  fullSummaryHeader:{paddingHorizontal:18,paddingTop:16,paddingBottom:15,borderBottomWidth:1,borderBottomColor:C.line,flexDirection:'row',alignItems:'center',gap:10},
  fullSummaryBookName:{color:C.text,fontWeight:'900',fontSize:19,marginTop:5},
  fullSummaryClose:{borderColor:C.line,borderWidth:1,borderRadius:12,paddingHorizontal:10,paddingVertical:10},
  fullSummaryCloseText:{color:C.muted,fontSize:10,fontWeight:'900'},
  fullSummaryBody:{padding:18,paddingBottom:35},
  fullSummaryHelp:{color:C.muted,fontSize:13,lineHeight:20,marginBottom:14},
  fullSummaryInput:{color:C.text,backgroundColor:C.panel,borderWidth:1,borderColor:C.line,borderRadius:16,padding:16,fontSize:16,lineHeight:24,height:380},
  fullSummaryTip:{color:C.muted,fontSize:11,lineHeight:18,marginTop:11},
  fullSummaryReadText:{color:C.text,fontSize:16,lineHeight:27},
  fullSummaryFooter:{paddingHorizontal:18,paddingVertical:12,borderTopWidth:1,borderTopColor:C.line,flexDirection:'row',gap:9,backgroundColor:C.bg},

  legend:{gap:8,paddingBottom:14},
  legendPill:{backgroundColor:C.panel2,borderRadius:999,borderWidth:1,borderColor:C.line,paddingHorizontal:11,paddingVertical:8},
  legendText:{color:C.muted,fontSize:10,fontWeight:'800'},

  noteCard:{backgroundColor:C.panel,borderWidth:1,borderColor:C.line,borderRadius:17,padding:16,marginBottom:12},
  noteTop:{flexDirection:'row',justifyContent:'space-between',gap:10,alignItems:'flex-start'},
  noteTopRight:{flexDirection:'row',alignItems:'center',gap:9},
  noteType:{color:C.gold,fontWeight:'900',fontSize:11},
  noteDate:{color:C.muted,fontSize:10},
  bookmarkBook:{color:C.muted,fontSize:10,marginTop:5,fontWeight:'700'},
  bookmarkButton:{width:34,height:34,borderRadius:999,borderWidth:1,borderColor:C.line,alignItems:'center',justifyContent:'center',marginTop:-8,marginRight:-7},
  bookmarkButtonActive:{borderColor:C.gold,backgroundColor:'#2A2214'},
  bookmarkIcon:{color:C.muted,fontSize:20,lineHeight:22},
  bookmarkIconActive:{color:C.gold},
  bookmarkOpen:{alignSelf:'flex-start',paddingTop:13,paddingBottom:1},
  bookmarkOpenText:{color:C.gold,fontSize:9,fontWeight:'900',letterSpacing:.8},
  noteText:{color:C.text,fontSize:16,lineHeight:23,marginTop:12},
  noteImage:{width:'100%',height:220,borderRadius:12,marginTop:12,backgroundColor:C.panel2},
  notePage:{color:C.muted,fontSize:10,marginTop:10},

  modalShade:{flex:1,backgroundColor:'rgba(0,0,0,.78)',justifyContent:'flex-end'},
  sheet:{backgroundColor:'#11100D',borderTopLeftRadius:26,borderTopRightRadius:26,borderWidth:1,borderColor:C.line,padding:20,paddingBottom:28},
  sheetTall:{backgroundColor:'#11100D',borderTopLeftRadius:26,borderTopRightRadius:26,borderWidth:1,borderColor:C.line,maxHeight:'94%',minHeight:'55%',overflow:'hidden'},
  sheetTallPadded:{padding:20,paddingBottom:34},
  memoryScrollContent:{padding:20,paddingBottom:46},
  modalTitle:{color:C.text,fontSize:26,fontWeight:'900',marginTop:4,marginBottom:18},
  modalActions:{flexDirection:'row',gap:10,justifyContent:'flex-end',marginTop:14,flexWrap:'wrap'},
  input:{backgroundColor:C.bg,borderWidth:1,borderColor:C.line,color:C.text,borderRadius:13,paddingHorizontal:14,paddingVertical:13,marginBottom:10,fontSize:15},
  textarea:{minHeight:115},
  memoryInput:{flex:1,minHeight:76,marginBottom:0},
  numberedInputRow:{flexDirection:'row',alignItems:'flex-start',gap:9,marginBottom:10},
  inputNumber:{width:28,height:28,borderRadius:999,backgroundColor:'#2B2315',alignItems:'center',justifyContent:'center',marginTop:10},
  inputNumberText:{color:C.gold,fontSize:12,fontWeight:'900'},
  questionNo:{color:C.gold,fontSize:9,fontWeight:'900',letterSpacing:1.3,marginTop:8},
  questionTitle:{color:C.text,fontSize:17,fontWeight:'900',lineHeight:23,marginTop:4,marginBottom:10},
  coverPicker:{width:92,height:132,borderRadius:12,borderWidth:1,borderStyle:'dashed',borderColor:C.gold,backgroundColor:C.panel,alignItems:'center',justifyContent:'center',marginBottom:14},
  coverPickerImage:{width:92,height:132,borderRadius:12},
  coverPickerText:{color:C.gold,fontSize:10,fontWeight:'900'},
  typeRow:{gap:8,paddingBottom:14},
  typeBtn:{borderWidth:1,borderColor:C.line,borderRadius:999,paddingHorizontal:12,paddingVertical:9,backgroundColor:C.panel},
  typeBtnActive:{borderColor:C.gold,backgroundColor:'#2A2214'},
  typeText:{color:C.muted,fontSize:11,fontWeight:'800'},
  typeTextActive:{color:C.gold},
  photoPicker:{minHeight:150,borderRadius:14,borderWidth:1,borderStyle:'dashed',borderColor:C.gold,backgroundColor:C.panel,alignItems:'center',justifyContent:'center',marginBottom:12,overflow:'hidden'},
  photoPickerText:{color:C.gold,fontWeight:'900',fontSize:12},
  photoPreview:{width:'100%',height:220},

  recallLead:{color:C.text,fontSize:20,fontWeight:'900',lineHeight:27},
  recallHint:{color:C.muted,fontSize:13,lineHeight:20,marginTop:7,marginBottom:14},
  recallInput:{minHeight:170},
  revealBox:{backgroundColor:'#17130D',borderWidth:1,borderColor:'#4A3C22',borderRadius:17,padding:16,marginTop:14},
  revealKicker:{color:C.gold,fontSize:9,fontWeight:'900',letterSpacing:1.2,marginBottom:12},
  revealLine:{color:C.text,fontSize:15,lineHeight:22,marginBottom:9,fontWeight:'700'},
  revealSub:{color:C.gold,fontSize:10,fontWeight:'900',letterSpacing:.8,marginTop:10,marginBottom:5},
  revealBody:{color:C.muted,fontSize:14,lineHeight:21},
});
