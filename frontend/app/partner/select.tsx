import React,{useEffect,useState} from "react";

import {
View,
Text,
Pressable,
StyleSheet,
} from "react-native";

import {SafeAreaView} from "react-native-safe-area-context";

import {router} from "expo-router";

import {api} from "@/src/api/client";

export default function PartnerSelect(){

const [items,setItems]=useState<any[]>([]);

useEffect(()=>{

api.get("/scanner/partners")

.then(setItems);

},[]);

return(

<SafeAreaView style={{flex:1}}>

{

items.map((p)=>(

<Pressable

key={p.id}

onPress={()=>{

router.push({

pathname:"/partner/scan",

params:{

partner_id:p.id,

},

});

}}

style={styles.row}

>

<Text>

{p.business_name}

</Text>

</Pressable>

))

}

</SafeAreaView>

);

}

const styles=StyleSheet.create({

row:{

padding:20,

borderBottomWidth:1,

},

});