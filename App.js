
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
const dailyIndex = len => {
  if (!len) return 0;
  const k = todayKey();
  let h = 0;
  for (let i=0;i<k.length;i++) h = ((h<<5)-h)+k.charCodeAt(i);
  return Math.abs(h)%len;
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

function Button({label,onPress,secondary,danger,small}) {
  return (
    <Pressable onPress={onPress} style={[
      s.btn, secondary && s.btnSecondary, danger && s.btnDanger, small && s.btnSmall
    ]}>
      <Text style={[
        s.btnText, secondary && s.btnTextSecondary, danger && s.btnTextDanger
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

function NoteCard({note,onDelete}) {
  const m = TYPE_MAP[note.type] || TYPE_MAP.idea;
  return (
    <Pressable onLongPress={onDelete} style={s.noteCard}>
      <View style={s.noteTop}>
        <Text style={s.noteType}>{m.emoji} {m.label}</Text>
        <Text style={s.noteDate}>{dateLabel(note.createdAt)}</Text>
      </View>
      {note.image ? <Image source={{uri:note.image}} style={s.noteImage}/> : null}
      {note.text ? <Text style={s.noteText}>{note.text}</Text> : null}
      {note.page ? <Text style={s.notePage}>str. {note.page}</Text> : null}
    </Pressable>
  );
}

export default function App() {
  const [data,setData] = useState({books:[]});
  const [loaded,setLoaded] = useState(false);
  const [tab,setTab] = useState('books');
  const [selectedId,setSelectedId] = useState(null);
  const [bookModal,setBookModal] = useState(false);
  const [noteModal,setNoteModal] = useState(false);

  const [bookTitle,setBookTitle] = useState('');
  const [bookAuthor,setBookAuthor] = useState('');
  const [bookCover,setBookCover] = useState(null);

  const [noteType,setNoteType] = useState('idea');
  const [noteText,setNoteText] = useState('');
  const [notePage,setNotePage] = useState('');
  const [noteImage,setNoteImage] = useState(null);

  useEffect(() => {
    (async()=>{
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        if (raw) setData(JSON.parse(raw));
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

  const daily = useMemo(() => {
    const pool = allNotes.filter(n=>n.type!=='photo' && (n.text||'').trim());
    return pool.length ? pool[dailyIndex(pool.length)] : null;
  },[allNotes]);

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
    setData(d=>({...d,books:d.books.map(b=>b.id===selected.id?{...b,finished:!b.finished}:b)}));
  }

  function deleteBook() {
    if (!selected) return;
    Alert.alert('Usunąć książkę?','Usunięte zostaną też wszystkie notatki.',[
      {text:'Anuluj',style:'cancel'},
      {text:'Usuń',style:'destructive',onPress:()=>{
        setData(d=>({...d,books:d.books.filter(b=>b.id!==selected.id)}));
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
      <ScrollView contentContainerStyle={{paddingBottom:110}}>
        <Header title="Jedna lekcja na dziś" subtitle="WRÓĆ DO TEGO, CO JUŻ PRZECZYTAŁEŚ"/>
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
          <Text style={s.infoTitle}>Jak z tego korzystać?</Text>
          <Text style={s.infoText}>Nie streszczaj całej książki. Łap to, co Cię zatrzymało, zmieniło sposób myślenia albo naprawdę chcesz zastosować.</Text>
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
    return (
      <View style={{flex:1}}>
        <Header title={selected.title} subtitle={selected.author||'TWOJA MAPA'} onBack={()=>setSelectedId(null)}
          right={<Button label="+ NOTATKA" small onPress={()=>setNoteModal(true)}/>}/>
        <ScrollView contentContainerStyle={{paddingBottom:80}}>
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
          ) : notes.map(n=><NoteCard key={n.id} note={n} onDelete={()=>deleteNote(n.id)}/>)}
        </ScrollView>
      </View>
    );
  }

  if (!loaded) return <SafeAreaView style={s.safe}><View style={s.loading}><Text style={s.loadingText}>Mapa Książki</Text></View></SafeAreaView>;

  return (
    <SafeAreaView style={s.safe}>
      <KeyboardAvoidingView style={{flex:1}} behavior={Platform.OS==='ios'?'padding':undefined}>
        <View style={s.app}>
          {selected ? <BookScreen/> : (tab==='books'?<BooksScreen/>:<TodayScreen/>)}

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

                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.typeRow}>
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
  btnText:{color:'#171109',fontWeight:'900',fontSize:11},
  btnTextSecondary:{color:C.text},
  btnTextDanger:{color:C.red},

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
  done:{color:C.green,fontSize:9,fontWeight:'900',letterSpacing:1},
  chev:{color:C.gold,fontSize:32},

  lesson:{backgroundColor:C.panel,borderWidth:1,borderColor:'#4A3C22',borderRadius:22,padding:24},
  lessonBook:{color:C.gold,fontSize:12,fontWeight:'900',letterSpacing:1},
  lessonType:{color:C.muted,marginTop:10,fontSize:12},
  lessonText:{color:C.text,fontSize:24,fontWeight:'800',lineHeight:34,marginVertical:18},
  info:{marginTop:16,backgroundColor:C.panel,borderRadius:18,padding:20,borderWidth:1,borderColor:C.line},
  infoTitle:{color:C.text,fontWeight:'900',fontSize:17},
  infoText:{color:C.muted,lineHeight:21,marginTop:8},

  tabs:{position:'absolute',left:18,right:18,bottom:12,height:68,backgroundColor:'#11100D',borderWidth:1,borderColor:C.line,borderRadius:22,flexDirection:'row'},
  tab:{flex:1,alignItems:'center',justifyContent:'center'},
  tabIcon:{color:C.muted,fontSize:20,fontWeight:'900'},
  tabText:{color:C.muted,fontSize:9,fontWeight:'900',marginTop:3,letterSpacing:1},
  active:{color:C.gold},

  hero:{flexDirection:'row',gap:16,backgroundColor:C.panel,borderWidth:1,borderColor:C.line,borderRadius:20,padding:14,marginBottom:18},
  heroCover:{width:92,height:132,borderRadius:12,backgroundColor:C.panel2},
  heroTitle:{color:C.text,fontSize:22,fontWeight:'900'},
  actionRow:{flexDirection:'row',flexWrap:'wrap',gap:8,marginTop:14},

  summary:{backgroundColor:'#17130D',borderWidth:1,borderColor:'#4A3C22',borderRadius:20,padding:20,marginBottom:18},
  summaryKicker:{color:C.gold,fontWeight:'900',fontSize:10,letterSpacing:1.3},
  summaryTitle:{color:C.text,fontSize:18,fontWeight:'900',marginTop:8,marginBottom:8},
  summaryLine:{color:'#DED6C7',lineHeight:21,marginBottom:6},

  legend:{gap:8,paddingBottom:14},
  legendPill:{backgroundColor:C.panel2,borderRadius:999,borderWidth:1,borderColor:C.line,paddingHorizontal:11,paddingVertical:8},
  legendText:{color:C.muted,fontSize:10,fontWeight:'800'},

  noteCard:{backgroundColor:C.panel,borderWidth:1,borderColor:C.line,borderRadius:17,padding:16,marginBottom:12},
  noteTop:{flexDirection:'row',justifyContent:'space-between',gap:10},
  noteType:{color:C.gold,fontWeight:'900',fontSize:11},
  noteDate:{color:C.muted,fontSize:10},
  noteText:{color:C.text,fontSize:16,lineHeight:23,marginTop:12},
  noteImage:{width:'100%',height:220,borderRadius:12,marginTop:12,backgroundColor:C.panel2},
  notePage:{color:C.muted,fontSize:10,marginTop:10},

  modalShade:{flex:1,backgroundColor:'rgba(0,0,0,.75)',justifyContent:'flex-end'},
  sheet:{backgroundColor:'#11100D',borderTopLeftRadius:26,borderTopRightRadius:26,borderWidth:1,borderColor:C.line,padding:20,paddingBottom:28},
  modalTitle:{color:C.text,fontSize:26,fontWeight:'900',marginTop:4,marginBottom:18},
  modalActions:{flexDirection:'row',gap:10,justifyContent:'flex-end',marginTop:14},
  input:{backgroundColor:C.bg,borderWidth:1,borderColor:C.line,color:C.text,borderRadius:13,paddingHorizontal:14,paddingVertical:13,marginBottom:10,fontSize:15},
  textarea:{minHeight:115},
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
});
