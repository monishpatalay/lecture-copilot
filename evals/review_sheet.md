# Eval question review sheet

The eval questions and their gold passages were written by an AI model. Tick a box when you agree; note anything wrong. Passages are automatic transcripts, so expect speech-recognition slips.

**Reviewed 2026-10-08 by Claude (an AI model), not by a person.** The same kind of model wrote the questions, so this is a second pass, not an independent human review. Result: 29 of 30 questions are clear (item 24 is not); all 30 passages answer their question, item 7 only partly. Items 8, 20, 21 and 30 have a second passage that could fairly be counted as correct.

## 1. How many permutations does a list of n numbers have?

Lecture 3, 22:25–22:54

> And then just double check which one's in the right order. Yeah? So there's sort of two key pieces to this particular technique, if we want to analyze it. I don't see a reason to belabor it too much. But there's sort of one is that we have to enumerate the permutations. Now, if I have a list of n numbers, how many different permutations of n numbers are there? Yes? N factorial. N factorial, right? So just by virtue of calling this permutation as function, I know that I incur at least n factorial time. It might be worse, right? It might be that actually listing permutations takes a lot of time for some reason. Like every permutation itself takes order n time. But at the very least, each one of these things looks like n factorial. I warned you, my handwriting is terrible. So that's what this omega thing is doing, if I recall properly. And then secondarily, well, we've got to check if that particular permutation is sorted.

- [x] The question is clear and has one answer
- [x] The passage answers it
- Notes:

## 2. What is the expected length of a chain, and when is it constant?

Lecture 4, 50:30–51:47

> hi is h j what is what is the expected value that they collide one right so I'm going to refactor this as being this where j does not equal i plus one are people okay with that because if i equals if j and i are equal they definitely collide right they're the same key right so I'm expected to have one guy there which was the original key xi right but otherwise we can use this universal property right that says if they're not equal and they collide which is exactly this case right the probability that that happens is 1 over m right and since it's an indicator random variable the expectation is their outcomes times their probability probabilities right so 1 times that probability plus 0 times 1 minus that probability right which is just 1 over m right so now we get the summation of 1 over m for j not equal to i plus 1 n oh and this sorry i did this wrong this isn't u this is n we're storing n keys right okay so now i'm looping over j this over all of those things how many things are there n minus 1 things right so this should equal 1 plus n minus 1 over m okay so that's what universality gives us so as long as we choose m to be like larger than n or at least linear in n then we're expected to have our chain lengths be constant right because this thing becomes a constant if m is at least order n does that make sense okay the last thing i'm going to leave you with is how do we make this thing dynamic if we're growing the number of things we're storing in this thing it's possible that as we grow n for a fixed m this thing will stop being m will stop being linear in n right well then all we have to do is if we get too far we rebuild the entire thing the entire hash table with the new m right just like we did with the dynamic array and you can prove we're not going to do that here but you can prove that you won't do that operation too often if you're resizing in the right way and so you just

- [x] The question is clear and has one answer
- [x] The passage answers it
- Notes:

## 3. Why does this class write selection sort recursively instead of with two for loops?

Lecture 3, 28:00–28:46

> Well, in some sense, is that everything to the right of this little red line that I've drawn here is in sorted order. In this case, because there's only one thing. Yeah? So now what am I going to do? I'm going to look to the left of the red line, find the next biggest thing. What's that? 8. Oh, come on. 8. There we go. Yeah, yeah, yeah. Wake up. OK. So, right. So the next biggest one is the 8. So we're going to swap it with the 3, put it at the end, and so on. I think you guys could all finish this off. I suppose there should be one last line here where everything is green and we're happy, but in some sense, we're pretty sure that an array of one item is in sorted order. And so, essentially, from a high level, what did selection sort do? Well, it just kept choosing the element, which was the biggest, and swapping it into the back, and then iterating. Now, in 6006, we're going to write selection sort in a way that you might not be familiar with. In some sense, this is not so hard to implement with two for loops. I think you guys could all do this at home. In fact, you may have already. But in this class, because we're concerned with proving correctness, proving efficiency, all that good stuff, we're going to write it in kind of a funny way, which is recursive. Now, I can't emphasize strongly enough how little you guys should implement this at home. This is mostly a theoretical version of selection sort, rather than one that you would actually want to write in code, because there's obviously a much better way to do it, and you'll see that in your recitation this week, I believe. But in terms of analysis, there's a nice, easy way to write it down. So we're going to sort of take this election sort algorithm, and we're going to divide it into two kind of chunks. One of them is find me the biggest thing in the first k elements of my array. I shouldn't use k, because that means key. The first i elements of my array. And the next one is to swap it into place, and then sort everything to the left. That's sort of the two pieces here. Let's write that down. OK, so what did I do? Well, in some sense, in step one here, I found the biggest with index less than or equal to i.

- [x] The question is clear and has one answer
- [x] The passage answers it
- Notes:

## 4. When you insert an object into a set, what is the key used for?

Lecture 3, 7:51–8:51

> So of course, in today's lecture, now that we've set out our goal, right, which is to fill in, like, if I wanted to write code for a set, how could I do it? Now, of course, our goal is to give different data structures that implement these and then understand them in terms of their efficiency, data storage, correctness, all that good stuff. So before we get into all these ugly details, let me pause for Are there any questions about this basic interface? Y'all should feel free to stop me any time, because this is going to be hella boring if you're not getting the first slide or two. Yes? Can you explain how insert . And then, like, you're adding this element . That's a fabulous question. So the question was, what exactly is this insert operation doing? So I think working in the analogy of the students in this classroom is kind of a reasonable one. So I'm going to build up an object, which is a student, right? So in this lecture notes, I think we've been consistent. I caught one or two typos. We're going to think of x as the object that contains all of the information. And then associated with that is one piece, which is called the key. That's where we're going to use the letter k. Right? And that's like your student ID. That's the thing I'm going to use to search. Right? So what the insert operation does is it takes this whole student object x, which includes your ID, your name, your phone number, all that good stuff. And it inserts it into the set with the understanding that when I search my set, I'm going to be searching by key. Right? So when I want to find a student, I have to put in my ID number. Does that make sense? Cool. Any other questions? That's great. Fabulous. OK. So now, let's talk about how to actually implement this thing. And thankfully, we're already equipped with at least a very simple way that we could implement a set based on what you've already seen in your previous programming classes or even in just in the last two lectures, which is one way to understand a set, or to implement it rather, would be to just store a giant array of objects that are in my set. I suppose continuing with the sort of theme of the last two lectures, this is not a space in memory, but rather a metaphorical array, you know, theoretical.

- [x] The question is clear and has one answer
- [x] The passage answers it
- Notes:

## 5. Why is n factorial only a lower bound on the number of leaves?

Lecture 5, 14:40–15:05

> Does that make you happy? Theta here. Thank you. Has to be at least. So this was right. OK. So at least this many. I could, there are algorithms that if it got to, it could take two different routes to get to the same output, right? So this is a lower bound on the number of leaves. OK. So what this argument is saying is that if I just replace the number of leaves n here with n factorial, I get a similar comparison sort lower bound now. So what is log of n factorial? Is this familiar from pset one, maybe? So one thing I could do is I could put in Sterling formula, right? And that'll give me something of the form n log n. But what's another way I could lower bound n factorial?

- [x] The question is clear and has one answer
- [x] The passage answers it
- Notes: Passage answers it (two routes can reach the same output). Read alone, "leaves" assumes the reader knows it is the decision tree of a comparison sort.

## 6. Why is a not allowed to be zero in the universal hash function?

Lecture 4, 42:16–42:39

> This is a not equal to zero Right? If I had zero here I kind of lose the key information and that's no good Does this make sense? So what this is doing is multiplying this key by some random number adding some random number modding by this prime and then modding by the size of my thing Okay? So it's doing a bunch of jumbling and there's some randomness involved here I'm choosing the hash function by choosing an a b randomly from this thing So when I start up my program Right? I'm going to instantiate this thing with some random a and b not deterministically Right? The user when they're using this thing doesn't know which a and b I picked Right? So it's really hard for them to give me a bad example Right? And this universal hash function this universal hash family shall we say really this is a family of functions and I'm choosing one randomly within that family is universal and universality says that what is the property of universality It means that the probability by choosing a hash function from this hash family that a certain key collides with another key

- [x] The question is clear and has one answer
- [x] The passage answers it
- Notes:

## 7. How are p, a and b chosen for the universal hash family?

Lecture 4, 41:27–42:11

> Okay? This is a little weird. And not only that this is still a fixed hash function I don't want that I want to generalize this to be a family of hash functions which are this h a b k for some random choice of a b in this larger range. All right. This is a lot of notation here. Essentially what this is saying is I have a hash family Okay? It's parametrized by the length of my hash function and some fixed large random prime that's bigger than u Just I'm going to pick some large prime number Okay? And that's going to be fixed when I make the hash table. Okay? And then when I instantiate the hash table I'm going to choose randomly one of these things by choosing a random a and a random b from this range Does that make sense?

- [x] The question is clear and has one answer
- [x] The passage answers it
- Notes: Partly. The passage says p is a fixed large prime bigger than u and that a and b are picked at random, but the range they are picked from is on the board, not spoken.

## 8. How does the number of comparisons in the worst case relate to the decision tree?

Lecture 4, 11:19–12:12

> Otherwise, it can't be correct, because I could look up the one that I'm not returning in that set, and it would never be able to return that value. Does that make sense? Yeah? What's n? n is always the number... For a data structure, n is the number of things stored in that data structure at that time, right? So the number of items in the data structure. That's what it means in all of these tables. Any other questions? Okay, so now we get to the fun part. How many comparisons does this algorithm have to do? Yeah, up there. What's up? All right, your colleague is jumping ahead for a second, but really, I have to do as many comparisons, in the worst case, as the longest root-to-leaf path in this tree, right? Because as I'm executing this algorithm, I'll go down this thing, always branching down, and at some point I'll get to a leaf, and in the worst case, if I happen to need to return this particular output, then I'll have to walk down the longest thing, right? It's the longest path. So, and the longest path is the same as the height of the tree. Okay? So the question then becomes, what is the minimum height of any binary tree that has at least n plus 1 leaves? Do you ever understand why we're asking that question? Okay, so in rest... Yeah? Could you go over again why it needs n plus 1 leaves? Why it needs n plus 1 leaves? If it's a correct algorithm, it needs to return... It needs to be able to return any of the n items that I'm storing, or say that the key that I'm looking for is not there. Great question. Okay, so what is the minimum height of any binary tree that has n plus 1... at least n plus 1 leaves? You can solve that... you can actually state a recurrence for that and solve that. You're going to do that in your recitation, but it's log n, right? Like, the best you can do is if this is a balanced binary tree, right?

- [x] The question is clear and has one answer
- [x] The passage answers it
- Notes: Answer is right (longest root-to-leaf path, i.e. the height). Lecture 5 says the same thing for sorting, so a second passage could fairly count as correct.

## 9. How do you check whether a list is already sorted, and how long does that check take?

Lecture 3, 23:09–24:17

> How are we going to do that? Well, it's a very easy way to check if a list is sorted, right? I'm going to do maybe 4i equals 1 to n minus 1. Notice, not a Python coder. It's going to look a little different, right? Then check, you know, is b i less than or equal to b i plus 1. Right? And so if this relationship is true for every single i, that was supposed to be a question mark. Right? This is less than or equal to with a question mark over it. It was my special notation. Right? So if I get all the way to the end of this for loop, and this is true everywhere, then my list is sorted, and life is good. Right? So how long does this algorithm take? Well, it's kind of staring you right in the face, right? Because you have an algorithm which is looping from 1 to n minus 1. So this step incurs order n time. It's theta of n time, because we've got to go all the way to the end of the list. So when I put these things together, permutation sort, well, remember that this check if sorted happens for every single permutation. So at the end of the day, our algorithm takes at least n factorial times n time. It's a great example of something that's even worse than n factorial, which somehow in my head is like the worst possible algorithm. Yeah? So do you think that Python implements permutation sort? I certainly hope not. Yes? Right. So the question was, why is it omega and not big O, which is a fabulous question in this course. So here's the basic issue. I haven't given you an algorithm for how to compute the set of permutations for a list of numbers. I just kind of call some magic function that I made up. But I know that that algorithm takes at least n factorial time in some sense, or if nothing else, the list of permutations is n factorial big, because that's all the stuff I have to compute.

- [x] The question is clear and has one answer
- [x] The passage answers it
- Notes:

## 10. Why does replacing an object that has an existing key take linear time in an unordered array?

Lecture 3, 13:33–14:02

> In the worst case, we saw this amortized argument before. If your set is allowed to kind of grow dynamically. And finally, if I wanted to find the minimum student ID in my classroom, sort of the only algorithm I can have if my list of students isn't sorted is to what? Just iterate over every single student in the class. And if the guy that I'm looking at has a smaller ID than the one that I found, replace it. Does that make sense to everybody? So basically, everything you can do in a set, you can implement. And I think all of you guys are more than qualified to implement as an unordered array. It's just going to be slow. Yes? Is it important to take into account that it's a dynamic? Yeah, that's right. So I actually, I don't know in this class, if you're, I guess the set interface in the way that we've described it here is dynamic. We can just keep adding stuff to it. In that case, remember this amortized argument from Eric's lecture says that on average, that will take order and time. . What was that? The insert stack of places. Oh, that's true. That's an even better, sorry. Even if it weren't dynamic. If I wanted to replace an existing key, like for some reason, two students have the same ID. This is a terrible analogy. I'm sorry. But in any event, if I wanted to replace an object with a new one, well, what I have to do, I'd have to search for that object first and then replace it. And that search is going to take order and time from our argument before. Thank you. OK. So right. In some sense, we're done. Right? We've now implemented the set interface. Life is good. And of course, this is the difference between existence and actually caring about the details inside of this thing. We've shown that one can implement a set, but it's not a terribly efficient way to do it by just storing a big hot mess disorganized list of numbers without any order. Yeah? So instead of that, conveniently, our colleague in the front row here has already suggested a different data structure, which is to store our set not as just a disorganized array in any arbitrary order, but rather to keep the items in our set organized by key.

- [x] The question is clear and has one answer
- [x] The passage answers it
- Notes:

## 11. What is counting sort?

Lecture 5, 39:38–41:06

> Right? Why can't we put a list there? That's exactly what we do. This is called counting sort. And what we do here is we still have this direct access array, and we're going to put a space u minus 0 to u minus 1. But instead of storing one thing here, at each key k, we store a pointer to a chain. This sounds like hashing, right? But the important thing is that I need to make sure, as I'm inserting things in here, then I'm maintaining the order in which they came in. Right? I can't just throw them willy-nilly, or else we have this problem up here that we had before. Right? So I need what I would say is a sequence data structure. Right? Something that will maintain the order that I, the extrinsic order that I had when I'm putting these things in. Right? So as I have multiple things with k, right, I'm going to put them in the order. I can basically, I can put, have a pointer to a dynamic array, or a linked list, where I just add things to the end. And then at the end of my algorithm, when I read off the things, I can just look at anyone that has a non-empty data structure under here, and read them off in the order that they came. Does that make sense? So for this example, I'm just going to do this last step here, from the first row to the second row. I'm going to have this direct access array with 0, 1, 2, 3, 4 on the slots. Right? So how am I going to do this counting sort now? I have 32, 42, 22, 0, 3, and 44. I'm going to take the first one, 32. I'm sorting by the most significant thing. I stick it here.

- [x] The question is clear and has one answer
- [x] The passage answers it
- Notes:

## 12. How quickly can you find the minimum or maximum in a sorted array?

Lecture 3, 15:18–15:58

> Right? So in other words, if I have this array of all of the students in our classroom, and the very first element in my array is going to be the student with the smallest ID number. The second is the second smallest ID number, all the way to the end of the array, which is the student with the biggest ID number. Now, does that mean I want to do arithmetic on student ID numbers? Absolutely not. But it's just a way to sort of impose order on that list so that I can search it very quickly later. OK. So if I want to fill in the set interface, and I have somehow a sorted array of students, right? So again, they're organized by student ID number. Then my runtime starts to get a little more interesting. Yeah? So now insertion, deletion still take the same amount of time. But let's say that I want to find the student with the minimum ID number, right? This find min function. Well, how could I do it in a sorted array? Keyword is sorted here. Where's the min element of an array? Yes? Yeah. In fact, I can give a moderately faster algorithm, which is just look at the first one, right? If I want the minimum element of an array, and the array is in sorted order, I know that's the first thing. Right? So that's order one time to answer that kind of a question. And similarly, if I want the thing with the biggest ID number, I look all the way at the end. Now, in 6-001, 6-042, you guys already, I think, learned about binary search, and even may have implemented it. So what do we know? If my array is sorted, how long does it take for me to search for any given element? Yes. Log n time. That's absolutely right. Because I can cut my array in half. If my key is bigger or smaller, then I look on the left or the right. And so this is a much more efficient means of searching a set. So in particular, 6-006 this year has 400 students. Maybe next year it has 4,000.

- [x] The question is clear and has one answer
- [x] The passage answers it
- Notes:

## 13. What is the lower bound for sorting in the comparison model, and which algorithm meets it?

Lecture 5, 16:17–16:43

> Well, I have a bunch of things here. That's n factorial. Half of these things, these half, n over two things, are bigger than or equal to n over two. Does that make sense? So I can certainly lower bound this thing by n over two to the n over two. That's a little easier thing to take a log of, right? If you take a log of that, that's asymptotically n log n. So what we're getting here is any sorting algorithm here takes at least n log n comparisons. And so merge sorts the best we can do. OK? Does that make sense to everybody? We're just piggybacking on the analysis we had about decision trees connecting leaves with the minimum height of any binary tree on that number of leaves.

- [x] The question is clear and has one answer
- [x] The passage answers it
- Notes:

## 14. Walk me through selection sort on the example list of numbers.

Lecture 3, 26:35–28:00

> I see your hand, but we're going to defer for a little bit. I'm sorry? . That's fabulous. Why don't we defer to the end of lecture, and we'll do it then. OK. So the first algorithm that we'll talk about for sorting, which is somewhat sensible, is something called selection sort. Selection sort is exactly what it sounds like. So let's say that we have a list of, oops. My laptop and the screen are not green. OK. Let's say I have a list of numbers 82493. This is a message that Jason, I think, is sending me in the course notes, but I haven't figured it out. But in any event, and I want to sort this list of numbers. Here's a simple algorithm for how to do it, which is I can find the biggest number in this whole list and stick it at the end. Yeah? So in this case, what's the biggest number in this list, everybody? 9. 9. See, this is why you go to MIT. OK. So I'm going to take that 9, find it, and then swap it out with the 3, which is at the end. And now what's my sort of inductive hypothesis? Well, in some sense, is that everything to the right of this little red line that I've drawn here is in sorted order. In this case, because there's only one thing. Yeah? So now what am I going to do? I'm going to look to the left of the red line, find the next biggest thing. What's that? 8. Oh, come on. 8. There we go. Yeah, yeah, yeah. Wake up. OK. So, right. So the next biggest one is the 8. So we're going to swap it with the 3, put it at the end, and so on. I think you guys could all finish this off. I suppose there should be one last line here where everything is green and we're happy, but in some sense, we're pretty sure that an array of one item is in sorted order. And so, essentially, from a high level, what did selection sort do? Well, it just kept choosing the element, which was the biggest, and swapping it into the back, and then iterating. Now, in 6006, we're going to write selection sort in a way that you might not be familiar with. In some sense, this is not so hard to implement with two for loops. I think you guys could all do this at home. In fact, you may have already. But in this class, because we're concerned with proving correctness, proving efficiency, all that good stuff, we're going to write it in kind of a funny way, which is recursive.

- [x] The question is clear and has one answer
- [x] The passage answers it
- Notes: Open-ended ("walk me through"), but the passage does walk through the example.

## 15. Why does the direct access array approach stop helping when u is as big as n squared?

Lecture 5, 23:53–24:36

> But, in general, if you just wanted to sort integers, you could say that dot key points back to the object itself if you want to just sort some integers. Does that make sense? It's a good question, though. Okay. So, that gives us a linear time algorithm when u is small, right? And, under this condition that I have unique keys when I want to sort, right? Those are fairly restrictive, so we might want to generalize this a little bit. Okay? So, that's direct access array sort. What if we had a set of keys that was a little larger? Right? So, instead of enforcing, so let's say u is theta n implies linear time sorting. That's great. Okay? So, now, what happens if we expand that range a little bit? Let's say u is less than or equal to n squared. Maybe just less than. Okay? Okay. This is a bigger range, right? And, if we instantiated a direct access array of quadratic size, we'd have a quadratic time algorithm. This is not helpful. Right? So, anyone have a way in which we could sort integers that are between 0 and n squared? Maybe using the stuff that we had above. Yeah? Could you perhaps like sort by the first n, kind of like the first digit? Ah! Your colleague is saying exactly the thing that I'm looking for, which is great. Which is, maybe we could break this larger number into two smaller numbers.

- [x] The question is clear and has one answer
- [x] The passage answers it
- Notes:

## 16. Why would you guess that selection sort takes n squared time?

Lecture 3, 38:41–39:30

> Right. So this is just a code version of the technique we've already talked about. Hopefully this makes sense. Right. So you find the biggest element between 0 and index i. Right. That's what we're going to call j here. I swap that with the one in index i. That's step two. And then step three is I still have to sort everything to the left of index i. And that's that recursive call. OK. So if I want to justify the runtime of this particular technique, well, now let's call that t for time. Yeah. Well, what do I do? Well, for one, I call selection sort with index i minus 1. Right. So that incurs time that looks like this. But I also call that prefix max function. And how much time does that take? That takes order n time. Yeah. So at the end of the day, I have some relationship that looks like this. Does that make sense? So by the way, notice that this order n kind of swallowed up the order one computations that I had to do, like to swap and so on. OK. So remember, there's this nice relationship, which you probably learned in your combinatorics class. Which is that 1 plus 2 plus dot dot dot plus n. OK. I can never remember exactly the formula, but I'm pretty sure that it looks like n squared. Yeah. So based on that and taking a look at this recursive thing, which is essentially doing exactly that. Right. n plus n minus 1 plus n minus 2 and so on. I might hypothesize that this thing is really order n squared. So if I'm going to do that, then again, if I want to use the same technique for proof, I have to plug this relationship in and then double check that it's consistent. Right. So maybe I hypothesize that T of n equals c n squared, in which case I plug it in here. I have c n squared equals with a question mark over it, c n minus 1 squared plus big O or even theta n here.

- [x] The question is clear and has one answer
- [x] The passage answers it
- Notes:

## 17. What is a collision?

Lecture 4, 27:36–28:23

> Just based on pigeonhole principle, I have more of these things. At least two of them have to go to something over here. In fact, if I have, say, u is bigger than n squared, for example, right? For any function I give you that maps this large space down to the small space, n of these things will map to the same place, right? So if I choose a bad function here, then I'll have to store n things at the same index location, and if I go there, I have to kind of check to see whether any of those are the things that I'm looking for. I haven't gained anything, right? I really want a hash function that will evenly distribute keys over this space, right? Does that make sense? But we have a problem here. If we need to store multiple things at a given location in memory, I can't do that. I have one thing I can put there. So I have two options on how to deal what I call collisions, right? If I have two items here, like a and b, these are different keys, right, in my universe of space. But it's possible that they both map down to some hash that has the same value, right? So where do I store it? If I first hashed a, and a is, I put a there, where do I put b? There are kind of two options. Is the second data structure perhaps a linked list so that it can store multiple things? Okay, so what your colleague was saying, can I store this one as a linked list, and then I can just insert a guy right next to where it was? What's the problem there? Are linked lists good with direct accessing by an index? No, they're terrible with get at and set at, right?

- [x] The question is clear and has one answer
- [x] The passage answers it
- Notes:

## 18. What is the indicator random variable X i j used in the chain length proof?

Lecture 4, 45:08–46:15

> is less than or equal to one over m for all any different two keys in my universe Does that make sense? So basically this thing has the property that if I randomly pick or if I for any two keys that I pick in my universe space if I randomly choose a hash function the probability that these things collide is less than one over m Why is that good? This is in some sense a measure of how well distributed these things are I want these things to collide with one over m probability so that these things don't collide very likely it's not very likely for these things to collide Does that make sense? So we won't prove that this hash family satisfies this universality property you'll do that in 046 but we can use this result to show that if we use this universal hash family that the length of our chains is expected to be constant length So we're going to use this property to prove that How do we prove that? We're going to do a little probability So how are we going to prove that? I'm going to define a random variable an indicator random variable Does anyone remember what an indicator random variable is? Yeah It's a variable that with some amount of probability is 1 and 1 minus that probability is 0 So I'm going to define this indicator random variable xij is a random variable over my choice of a hash function in hash family and what does this mean? It means xij equals 1 if hash ki equals hkj these things collide and 0 otherwise So I'm choosing randomly over this hash family if for two keys i and j key i and key j if these things collide that's going to be 1 if they don't then it's 0 okay then how can we write a formula for the length of a chain in this model right so the size of a chain right

- [x] The question is clear and has one answer
- [x] The passage answers it
- Notes:

## 19. In the least-significant-first example, what went wrong with 42 and 44?

Lecture 5, 34:49–35:55

> But when I did the less significant thing, it erased all of my work from up here. Does that make sense? In the case of ties, we want the more significant thing to take precedence. So we want to do that thing last. Does that make sense? So the right way to do this, this is most significant first. Add. Okay. Not good. All right. Least significant first. Let's try that. So least significant here is 2. Okay. So I see 32, 42, 22, 03, and then 44. Okay? Sound good? Least significant first. Now I do most significant. I sort the most significant thing. Okay. So what's the most significant thing? 0, 3, 22, 32, most significant 4, 44, and 42. Cool. We're sorted, right? I did what you told me to do. I sorted by the most significant thing. What's the problem here? What did I do wrong? You wanted me to put 42 here and 44 here, right? Because 42 came first in the input and 44 came second, right? Okay. Okay. If the sorting algorithm maintains this property, that if they are the same thing, right? 4 came second, right? OK, if a sorting algorithm maintains this property, that if they are the same thing, right, then the output maintains their order from the input to the output, their relative order.

- [x] The question is clear and has one answer
- [x] The passage answers it
- Notes:

## 20. What is the worst case for looking something up in a hash table?

Lecture 5, 5:58–6:30

> In particular, I got constant time for finding, inserting, and deleting into this data structure in expectation. We did a little proof of that the chain lengths, where we stored collisions in our hash function, in our hash table, sorry, those wouldn't be very long. And so if they were constant, then I don't have to search more than a constant number of things when I go to a hashed index location. Does everyone remember what we talked about last week? And we then, I didn't show you this chart at the end, but I'm showing it to you now. Essentially what we had was we have a bunch of different ways to deal with this set interface. And last week, we talked about the sorted array, and then we talked about this direct access array in this hash table, right? Which do better for these dictionary, the find and insert and delete operations, or at least better in an expected sense, right? What's the worst case performance of a hash table? If I have to look up something in a hash table, and I happen to choose a bad hash function, what's the worst case here? What? N, right? It's worse than a sorted array, right? Because potentially I hashed everything that I was storing to the same index in my hash table, and to be able to distinguish between them, I can't do anything more than a linear search, right? I mean, I could store another set's data structure as my chain and do better that way. That's actually how Java does it. They store data structure we're going to be talking about next week as the chains so that they can get worst case log n. But in general, that hash table is only good if we're allowing, OK, I want this to be expected good, but in the worst case, if I really need that operation to be worst case, right, I really can't afford linear time ever for an operation of that kind, then I don't want to use a hash table.

- [x] The question is clear and has one answer
- [x] The passage answers it
- Notes: Answer is right (linear, everything can hash to one slot). This passage is Lecture 5's recap; Lecture 4 may answer it too, which I did not check.

## 21. For which values of u does radix sort take linear time?

Lecture 5, 50:22–51:00

> So I also get this factor. Does that make sense? So how long is that? Is that good? Is that bad? For what values of u is this linear time? If u is less than n to the c for some constant c, then this c comes out of the logarithm. Log n of n is 1. And we get a linear time algorithm. Does that make sense? OK, so that's how we can sort in linear time if our things are only polynomially large, right? So in counting sort, we get n plus u. In radix sort, we get also a stable sorting algorithm where the running time is n plus n times log base n of u. Does that make sense? And then, in the situations where there's a typo there in counting sort, that should be when u is order n, counting sort runs in linear time.

- [x] The question is clear and has one answer
- [x] The passage answers it
- Notes: Answer is right (u below n to the c). Its passage overlaps item 30's almost word for word, so the search can return the neighbour and be scored as a miss.

## 22. What is the word size w and how must u relate to it?

Lecture 4, 21:43–22:38

> I can't store arbitrary objects, items with keys. And in particular, I also need to, this is a subtlety that's in the WordRAM model, how can I be assured that these keys can be looked up in constant time? How does my CPU, this little CPU, right? It's got some number of registers it can act upon. How big are those registers? What? Well, so right now they're 64 bits, but in general, they're W. They're the size of your word on your machine. That's how many, two to the W is the number of addresses I can access. So implicitly, I'm kind of, if I'm going to be able to use this direct access array, I need to make sure that the U is less than two to the W, right? If I want these operations to run in constant time, right? If I have keys that are much larger than this, I'm going to need to do something else, okay? But this is kind of the assumption. In this class, when we give you like an array of integers or an array of strings or something like that on your problem set or on an exam, right? The assumption is unless we give you bounds on the size of those things, right? Like the number of characters in your string or the size of the number in the thing, you can assume that those things will fit in in one word of memory, okay? W is the word size of your machine, right? The number of bits that your machine can do operations on in constant time. Any other questions? Okay, so we have this problem. We're using way too much space, right? When we have a large universe of keys. So, how do we get around that problem? Any ideas? Sure.

- [x] The question is clear and has one answer
- [x] The passage answers it
- Notes:

## 23. What goes wrong if you sort by the most significant digit first and then by the least significant?

Lecture 5, 32:55–34:49

> There's discrepancy here. All right. Let's try it out. All right. Tuple sort. Let's start by sorting these things by least significant first and then least significant. That was the first thing I asked you. Right? All right. So these are the most significant things, the first ones. And these are the less significant things. All right. So instead of writing it as tuples, I'm going to write them as 32, 0, 3, 44, 42, 22. Is everyone cool with that? This is just base 5 representation. OK? All right. So let's start by sorting all of these things by the most significant thing. Right? Which is by this guy, this guy, this guy, this guy, and this guy. OK. So how do I do it? The first one is 0, 3. The second one is 22. The next one is 32. 42. And then 44. Maybe 44. I don't know. Does it matter? The order in which I put these things? I don't know. I'm just going to keep it the same order for now. All right. So I've sorted it by the least significant, or the most significant. Sorry. The leading term. And now I'm going to sort by the least significant. So what's the least significant here? 22. Then 2 is also. This is also 2. This is also 2. This is 3. And sorted list. Voila. Why did that not work? Yeah. So what happened is I did take into account the significant digit sort. But when I did the less significant thing, it erased all of my work from up here. Does that make sense? In the case of ties, we want the more significant thing to take precedence. So we want to do that thing last. Does that make sense? So the right way to do this, this is most significant first. Add. Okay. Not good. All right. Least significant first. Let's try that. So least significant here is 2. Okay. So I see 32, 42, 22, 03, and then 44. Okay? Sound good? Least significant first. Now I do most significant.

- [x] The question is clear and has one answer
- [x] The passage answers it
- Notes:

## 24. How do you lower bound n factorial without that formula?

Lecture 5, 15:33–16:17

> Does that make you happy? Theta here. Thank you. Has to be at least. So this was right. OK. So at least this many. I could, there are algorithms that if it got to, it could take two different routes to get to the same output, right? So this is a lower bound on the number of leaves. OK. So what this argument is saying is that if I just replace the number of leaves n here with n factorial, I get a similar comparison sort lower bound now. So what is log of n factorial? Is this familiar from pset one, maybe? So one thing I could do is I could put in Sterling formula, right? And that'll give me something of the form n log n. But what's another way I could lower bound n factorial? Well, I have a bunch of things here. That's n factorial. Half of these things, these half, n over two things, are bigger than or equal to n over two. Does that make sense? So I can certainly lower bound this thing by n over two to the n over two. That's a little easier thing to take a log of, right? If you take a log of that, that's asymptotically n log n. So what we're getting here is any sorting algorithm here takes at least n log n comparisons. And so merge sorts the best we can do. OK? Does that make sense to everybody? We're just piggybacking on the analysis we had about decision trees connecting leaves with the minimum height of any binary tree on that number of leaves.

- [ ] The question is clear and has one answer
- [x] The passage answers it
- Notes: NOT clear on its own: "that formula" refers to Stirling's formula, which the question never names. Suggested wording: "How do you lower bound n factorial without Stirling's formula?" The passage does answer it.

## 25. How are the items arranged in the sorted array version of a set?

Lecture 3, 14:17–15:18

> Oh, that's true. That's an even better, sorry. Even if it weren't dynamic. If I wanted to replace an existing key, like for some reason, two students have the same ID. This is a terrible analogy. I'm sorry. But in any event, if I wanted to replace an object with a new one, well, what I have to do, I'd have to search for that object first and then replace it. And that search is going to take order and time from our argument before. Thank you. OK. So right. In some sense, we're done. Right? We've now implemented the set interface. Life is good. And of course, this is the difference between existence and actually caring about the details inside of this thing. We've shown that one can implement a set, but it's not a terribly efficient way to do it by just storing a big hot mess disorganized list of numbers without any order. Yeah? So instead of that, conveniently, our colleague in the front row here has already suggested a different data structure, which is to store our set not as just a disorganized array in any arbitrary order, but rather to keep the items in our set organized by key. Right? So in other words, if I have this array of all of the students in our classroom, and the very first element in my array is going to be the student with the smallest ID number. The second is the second smallest ID number, all the way to the end of the array, which is the student with the biggest ID number. Now, does that mean I want to do arithmetic on student ID numbers? Absolutely not. But it's just a way to sort of impose order on that list so that I can search it very quickly later. OK. So if I want to fill in the set interface, and I have somehow a sorted array of students, right? So again, they're organized by student ID number. Then my runtime starts to get a little more interesting. Yeah? So now insertion, deletion still take the same amount of time. But let's say that I want to find the student with the minimum ID number, right? This find min function. Well, how could I do it in a sorted array? Keyword is sorted here. Where's the min element of an array? Yes? Yeah.

- [x] The question is clear and has one answer
- [x] The passage answers it
- Notes:

## 26. What is the running time of counting sort and why?

Lecture 5, 42:37–43:32

> 32. And then 42, 4. Okay, 42. Sorry. 42. All right. This is not so much different yet than dynamic array, direct access array sort. But when we get to this duplicate, right, 44 here, we now have two things in this thing. And because we are keeping them in order in this sequence, I'm appending to the end. Then when I go and read off the different things, then I'm returning them in a stable way, in the way that I want them to be. Does that make sense? And it's not overriding the work I did on the lower significant digits. Okay? So how long does this take? This also only takes order n plus u. Because I'm instantiating this thing of size u. And then how big are these data structures? Well, maybe I'm storing one, a constant amount for each index. So that's a u overhead. And then I'm paying one for every item I'm storing. Right? These things are only the lengths. The sum total of their lengths is n. Right? Because I'm only storing n things in there. So the total amount of space, the total amount of work I have to do is order n. I need to be able to append in constant time. And I need to be able to cycle through these things, iterate over them in linear time. But if I have that, I get n plus u. Yeah? How do you ensure that with this, like your length list, or like your dynamic, like those elements, like 4, 3, 4, 4, how do you ensure that those are sorted?

- [x] The question is clear and has one answer
- [x] The passage answers it
- Notes:

## 27. What happens to search time if the class grows to a billion students?

Lecture 3, 16:34–17:03

> In fact, I can give a moderately faster algorithm, which is just look at the first one, right? If I want the minimum element of an array, and the array is in sorted order, I know that's the first thing. Right? So that's order one time to answer that kind of a question. And similarly, if I want the thing with the biggest ID number, I look all the way at the end. Now, in 6-001, 6-042, you guys already, I think, learned about binary search, and even may have implemented it. So what do we know? If my array is sorted, how long does it take for me to search for any given element? Yes. Log n time. That's absolutely right. Because I can cut my array in half. If my key is bigger or smaller, then I look on the left or the right. And so this is a much more efficient means of searching a set. So in particular, 6-006 this year has 400 students. Maybe next year it has 4,000. And eventually it's going to have billions, right? Then what's going to happen? Well, if I use my unordered array, and I have a billion students in this class, it's going to happen. Well, then it's going to take me roughly a billion computations to find any one student in this course. Whereas log of a billion is a heck of a lot faster, right? On the other hand, I've kind of swept a detail under the rug here, which is how do I actually get a sorted array to begin with? And what we're going to see in today's lecture is that that takes more time than building it if I just have a disorganized list, right? Building a disorganized list is an easy thing to do. You probably all do it at home when you're cleaning house. Yeah? But actually sorting a list of numbers requires a little bit more work. And so this is a great example where there's at least a tiny amount of trade-off, right? Where now building my sorted array to represent my set is going to take a little more computation. We're going to see it's n log n time. But then once I've done that, sort of at step zero, now a lot of these other operations that I typically care about in a set, like searching it for a given key, are going to go a lot faster using binary search.

- [x] The question is clear and has one answer
- [x] The passage answers it
- Notes:

## 28. Why not make the hash table itself a linked list to handle collisions?

Lecture 4, 28:25–29:16

> If I have two items here, like a and b, these are different keys, right, in my universe of space. But it's possible that they both map down to some hash that has the same value, right? So where do I store it? If I first hashed a, and a is, I put a there, where do I put b? There are kind of two options. Is the second data structure perhaps a linked list so that it can store multiple things? Okay, so what your colleague was saying, can I store this one as a linked list, and then I can just insert a guy right next to where it was? What's the problem there? Are linked lists good with direct accessing by an index? No, they're terrible with get at and set at, right? They take linear time there, right? So really the whole point of direct access array is that there is an array underneath, and I can do this index from arithmetic and go down to the next thing. So I really don't want to replace a linked list as this data structure. Yeah? What's up? We can make it really unlikely, sure. I don't know what likely means because I'm giving you a hash function, one hash function, and I don't know what the inputs are. Yeah? Go ahead. We can instead store the items in the array somewhere and hold the address. Okay, right. So there are actually two solutions here. One is, maybe if I choose M to be larger than N, right, there's going to be extra space in here. I'll just stick it somewhere else in the existing array. Right? How I find an open space is a little complicated, but this is a technique called open addressing, which is much more common than the technique we're going to be talking about today in implementations.

- [x] The question is clear and has one answer
- [x] The passage answers it
- Notes:

## 29. How many base n digits does a number of size u have?

Lecture 5, 48:17–48:52

> Right? So basically, each one of my digits can range from 0 to n, right? How many digits do I have if I have, how many base n digits do I have if I have a number of size u? Yeah, log n of u. Number of digits is log n of u. Log base n of u, right? So how long does ray n n tuple sort on digits using counting sort? From least to most significant, right? That's the algorithm. How long does that take? How long does it take to sort on a digit that spans the keys 0 to n?

- [x] The question is clear and has one answer
- [x] The passage answers it
- Notes:

## 30. How do counting sort and radix sort compare in running time?

Lecture 5, 51:00–51:40

> So I also get this factor. Does that make sense? So how long is that? Is that good? Is that bad? For what values of u is this linear time? If u is less than n to the c for some constant c, then this c comes out of the logarithm. Log n of n is 1. And we get a linear time algorithm. Does that make sense? OK, so that's how we can sort in linear time if our things are only polynomially large, right? So in counting sort, we get n plus u. In radix sort, we get also a stable sorting algorithm where the running time is n plus n times log base n of u. Does that make sense? And then, in the situations where there's a typo there in counting sort, that should be when u is order n, counting sort runs in linear time. And it's linear time also, in the case of rating sort, if our things are bounded by a polynomial in n, right? By n to the c for some constant c. Does that make sense? All right, so that's how to sort in linear time with the caveat that your numbers aren't too big. OK, see you next week.

- [x] The question is clear and has one answer
- [x] The passage answers it
- Notes: Answer is right. Passage overlaps item 21's (see there).
